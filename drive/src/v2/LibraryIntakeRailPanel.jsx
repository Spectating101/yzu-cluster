import { useRef, useState } from "react";
import { handleEnterToSubmit } from "@/v2/enterToSubmit";
import {
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";

function pluralCount(value, singular, plural = `${singular}s`) {
  const count = Number(value || 0);
  return `${count} ${count === 1 ? singular : plural}`;
}

export function LibraryIntakeRailPanel({
  object,
  onSubmitUpload,
  onSubmitUrl,
  onSubmitProcure,
}) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [target, setTarget] = useState("");
  const names = files.map((file) => file.name).filter(Boolean);
  const mode = object?.mode || "upload";
  const destination = object?.destination || "Library root";

  const chooseFiles = () => inputRef.current?.click();
  const setPickedFiles = (picked) => setFiles(Array.from(picked || []));

  if (mode === "url") {
    return (
      <RailFrame>
        <RailEntityHeader
          id={object.id}
          title="Add URL / DOI"
          description="Inspect a public source, retain its metadata, and prepare the next valid Library action."
          pills={<span className="rd-v2-pill ext">Intake</span>}
        />
        <div className="rd-v2-rail-scroll">
          <RailFieldGrid>
            <RailField label="Destination" value={destination} />
            <RailField label="Path" value={object.path} />
          </RailFieldGrid>
          <div className="rd-v2-rail-intake">
            <label htmlFor="rd-v2-rail-url-input">URLs or DOIs</label>
            <textarea
              id="rd-v2-rail-url-input"
              rows={7}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="https://doi.org/10.1234/example&#10;https://data.example.org/dataset"
              onKeyDown={(event) => {
                handleEnterToSubmit(event, () => {
                  if (target.trim()) onSubmitUrl?.(target.trim(), object);
                });
              }}
            />
            <p className="rd-v2-ask-send-hint">Enter to inspect · ⇧↵ newline</p>
          </div>
        </div>
        <RailStickyFooter>
          <button
            type="button"
            className="rd-v2-btn sm primary"
            disabled={!target.trim()}
            onClick={() => onSubmitUrl?.(target.trim(), object)}
          >
            Inspect source
          </button>
        </RailStickyFooter>
      </RailFrame>
    );
  }

  if (mode === "procure") {
    return (
      <RailFrame>
        <RailEntityHeader
          id={object.id}
          title="Find missing evidence"
          description="Use this Library location as context for a wider evidence search and acquisition review."
          pills={<span className="rd-v2-pill ext">Discover</span>}
        />
        <div className="rd-v2-rail-scroll">
          <RailFieldGrid>
            <RailField label="Destination" value={destination} />
            <RailField label="Path" value={object.path} />
            <RailField label="Held evidence" value={pluralCount(object.counts?.datasets, "asset")} />
            <RailField label="Query-ready" value={String(object.counts?.queryReady ?? 0)} />
          </RailFieldGrid>
        </div>
        <RailStickyFooter>
          <button type="button" className="rd-v2-btn sm primary" onClick={() => onSubmitProcure?.(object)}>
            Find evidence
          </button>
        </RailStickyFooter>
      </RailFrame>
    );
  }

  return (
    <RailFrame>
      <RailEntityHeader
        id={object.id}
        title="Upload files"
        description="Stage local evidence for the current Library location before ingestion."
        pills={<span className="rd-v2-pill lab">Upload</span>}
      />
      <div className="rd-v2-rail-scroll">
        <RailFieldGrid>
          <RailField label="Destination" value={destination} />
          <RailField label="Path" value={object.path} />
        </RailFieldGrid>
        <div
          className="rd-v2-rail-upload-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            setPickedFiles(event.dataTransfer?.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            aria-label="Choose files to upload"
            onChange={(event) => setPickedFiles(event.target.files)}
          />
          <strong>Drop files here</strong>
          <p>or choose files from disk for Library ingestion.</p>
          <button type="button" className="rd-v2-btn sm" onClick={chooseFiles}>
            Choose files
          </button>
        </div>
        <div className="rd-v2-rail-file-list" aria-label="Selected files">
          {names.length ? names.map((name) => <span key={name}>{name}</span>) : <p>No files selected yet.</p>}
        </div>
      </div>
      <RailStickyFooter>
        <button
          type="button"
          className="rd-v2-btn sm primary"
          disabled={!files.length}
          onClick={() => onSubmitUpload?.(files, object)}
        >
          Prepare upload
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}
