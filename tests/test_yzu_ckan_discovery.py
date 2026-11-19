from __future__ import annotations
import unittest
from urllib.parse import parse_qs, urlparse
from scripts.yzu_cluster.interop_ckan_discovery import discover

class CkanDiscoveryTest(unittest.TestCase):
    def test_discovery_does_not_register_data(self):
        observed = []
        def fake(url):
            observed.append(url)
            return {"success": True, "result": {"count": 99, "results": [{"id": "uuid-a", "name": "solar-irradiance", "title": "Solar irradiance", "notes": "Observed", "license_id": "cc-by-4", "resources": [{"url": "https://elsewhere.invalid/asset"}]}]}}
        result = discover("energy & solar", fetch_json=fake)
        self.assertEqual(parse_qs(urlparse(observed[0]).query)["q"], ["energy & solar"])
        self.assertEqual(result["reported_total"], 99)
        row = result["candidates"][0]
        self.assertFalse(row["approved"])
        self.assertFalse(row["collected"])
        self.assertFalse(row["registered"])
        self.assertFalse(row["query_ready"])
        self.assertEqual(row["resource_count"], 1)

    def test_fails_on_unreviewed_host_or_bad_shape(self):
        with self.assertRaises(ValueError):
            discover("energy", catalog="http://127.0.0.1:8000")
        with self.assertRaises(ValueError):
            discover("energy", fetch_json=lambda _: {"success": False})
        with self.assertRaises(ValueError):
            discover("x")
        with self.assertRaises(ValueError):
            discover("energy", limit=100)

if __name__ == "__main__":
    unittest.main()
