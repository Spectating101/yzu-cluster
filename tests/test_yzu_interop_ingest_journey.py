from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.yzu_cluster.interop_ingest import (
    RC2_GOLDEN_DATASET_ID,
    TEST_INGEST_FIXTURE_ID,
    TEST_INGEST_LABEL,
    IngestJourney,
    fixture_payload_path,
)


class IngestJourneyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        root = Path(self.tempdir.name)
        self.database = root / "interop.sqlite"
        self.vault = root / "vault"
        self.journey = IngestJourney.open(self.database, self.vault)

    def tearDown(self) -> None:
        self.journey.close()
        self.tempdir.cleanup()

    def test_fixture_is_labelled_test_ingest_not_rc2_golden(self) -> None:
        payload_path = fixture_payload_path()
        payload = json.loads(payload_path.read_text(encoding="utf-8"))
        self.assertEqual(payload["fixture_id"], TEST_INGEST_FIXTURE_ID)
        self.assertIn("TEST INGEST", payload["label"])
        self.assertIn("later-main", payload["label"])
        self.assertTrue(payload["not_rc2"])
        self.assertNotEqual(TEST_INGEST_FIXTURE_ID, RC2_GOLDEN_DATASET_ID)
        self.assertNotEqual(payload["fixture_id"], RC2_GOLDEN_DATASET_ID)
        self.assertEqual(
            payload["rc2_golden_dataset_id_this_is_not"],
            RC2_GOLDEN_DATASET_ID,
        )
        self.assertIn(TEST_INGEST_LABEL, payload["label"])

    def test_fresh_ingest_survives_processing_restart_failure_retry_without_false_completion(
        self,
    ) -> None:
        first = self.journey.ingest_fixture()
        evidence_id = first["evidence_id"]
        source_bytes = fixture_payload_path().read_bytes()

        self.assertNotEqual(evidence_id, RC2_GOLDEN_DATASET_ID)
        self.assertTrue(evidence_id.startswith(TEST_INGEST_FIXTURE_ID))
        self.assertEqual(first["ingest"]["status"], "completed")
        self.assertIsNone(first["ingest"]["registration_id"])
        self.assertFalse(first["journey_complete"])
        self.assertEqual(first["analysis_readiness"], "ingested")
        self.assertEqual(
            Path(first["vault_source_path"]).read_bytes(),
            source_bytes,
        )
        self.assertEqual(first["sha256"], first["provenance"]["sha256"])
        self.assertIn("TEST INGEST", first["provenance"]["label"])
        self.assertTrue(first["provenance"]["not_rc2"])

        replay = self.journey.ingest_fixture()
        self.assertEqual(replay["evidence_id"], evidence_id)
        self.assertEqual(replay["ingest"]["run_id"], first["ingest"]["run_id"])
        copies = list(self.vault.glob("**/payload.json"))
        self.assertEqual(len(copies), 1)

        queued = self.journey.queue_synthesis(evidence_id)
        self.assertEqual(queued["status"], "queued")
        self.assertFalse(self.journey.evidence(evidence_id)["journey_complete"])

        self.journey.close()
        self.journey = IngestJourney.open(self.database, self.vault)
        recovered = self.journey.evidence(evidence_id)
        self.assertEqual(recovered["evidence_id"], evidence_id)
        self.assertEqual(Path(recovered["vault_source_path"]).read_bytes(), source_bytes)
        self.assertEqual(recovered["sha256"], first["sha256"])
        self.assertEqual(recovered["ingest"]["run_id"], first["ingest"]["run_id"])
        self.assertEqual(recovered["synthesis"]["status"], "queued")
        self.assertFalse(recovered["journey_complete"])

        failed = self.journey.synthesize(evidence_id, inject_failure=True)
        self.assertEqual(failed["status"], "failed")
        self.assertTrue(failed["retryable"])
        self.assertIn("injected worker failure", failed["error"])
        self.assertFalse(self.journey.evidence(evidence_id)["journey_complete"])
        self.assertIsNone(self.journey.evidence(evidence_id).get("asset"))
        self.assertFalse((Path(recovered["vault_dir"]) / "panel.json").exists())
        with self.assertRaisesRegex(ValueError, "must retry"):
            self.journey.store.record(
                failed["run_id"],
                "completed",
                worker_id=self.journey.worker_id,
                outputs=[f"{evidence_id}_panel"],
            )

        self.journey.close()
        self.journey = IngestJourney.open(self.database, self.vault)
        after_crash = self.journey.evidence(evidence_id)
        self.assertEqual(after_crash["evidence_id"], evidence_id)
        self.assertEqual(Path(after_crash["vault_source_path"]).read_bytes(), source_bytes)
        self.assertEqual(after_crash["synthesis"]["status"], "failed")
        self.assertFalse(after_crash["journey_complete"])
        self.assertEqual(
            self.journey.store.db.execute(
                "SELECT COUNT(*) FROM assets"
            ).fetchone()[0],
            0,
        )

        retried = self.journey.retry_synthesis(evidence_id)
        self.assertEqual(retried["status"], "retrying")
        completed = self.journey.synthesize(evidence_id)
        self.assertEqual(completed["job"]["status"], "registered")
        self.assertEqual(completed["asset"]["dataset_id"], f"{evidence_id}_panel")
        self.assertEqual(completed["asset"]["analysis_readiness"], "registered")
        self.assertNotEqual(completed["asset"]["analysis_readiness"], "query_ready")
        self.assertEqual(completed["asset"]["lineage"]["inputs"], [evidence_id])
        self.assertEqual(completed["asset"]["checksum"], first["sha256"])
        self.assertTrue((Path(after_crash["vault_dir"]) / "panel.json").is_file())

        final = self.journey.evidence(evidence_id)
        self.assertTrue(final["journey_complete"])
        self.assertEqual(final["analysis_readiness"], "registered")
        self.assertEqual(final["ingest"]["run_id"], first["ingest"]["run_id"])
        self.assertEqual(final["synthesis"]["run_id"], queued["run_id"])
        self.assertEqual(final["asset"]["dataset_id"], f"{evidence_id}_panel")
        self.assertNotEqual(final["asset"]["dataset_id"], RC2_GOLDEN_DATASET_ID)

        duplicate = self.journey.ingest_fixture()
        self.assertEqual(duplicate["evidence_id"], evidence_id)
        self.assertEqual(duplicate["ingest"]["run_id"], first["ingest"]["run_id"])
        self.assertEqual(
            self.journey.store.db.execute("SELECT COUNT(*) FROM runs").fetchone()[0],
            2,
        )
        self.assertEqual(
            self.journey.store.db.execute("SELECT COUNT(*) FROM assets").fetchone()[0],
            1,
        )
        registered_events = self.journey.store.db.execute(
            "SELECT COUNT(*) FROM events WHERE run_id=? AND event_type='registered'",
            (final["synthesis"]["run_id"],),
        ).fetchone()[0]
        self.assertEqual(registered_events, 1)
        self.assertEqual(list(self.vault.glob("**/payload.json")), copies)

        again = self.journey.synthesize(evidence_id)
        self.assertEqual(again["job"]["run_id"], final["synthesis"]["run_id"])
        self.assertEqual(again["asset"]["dataset_id"], final["asset"]["dataset_id"])
        self.assertEqual(
            self.journey.store.db.execute("SELECT COUNT(*) FROM assets").fetchone()[0],
            1,
        )


if __name__ == "__main__":
    unittest.main()
