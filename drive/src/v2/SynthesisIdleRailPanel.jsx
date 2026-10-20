import { AskUnavailableNote } from "@/v2/askNote";
import {
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";

export function SynthesisIdleRailPanel({ onAskAbout }) {
  return (
    <RailFrame>
      <RailEntityHeader
        title="No build selected"
        description="Start a build from a research question, or reuse a saved method. Every build takes four steps."
      />
      <div className="rd-v2-rail-scroll">
        <RailFieldGrid>
          <RailField label="Describe it" value="What the data should measure" />
          <RailField label="Choose data" value="From your Library, or request more" />
          <RailField label="Approve" value="Nothing runs before you approve the method" />
          <RailField label="Get the dataset" value="Saved to your Library with its sources" />
        </RailFieldGrid>
      </div>
      <RailStickyFooter>
        {onAskAbout ? <button type="button" className="rd-v2-btn sm" onClick={() => onAskAbout()}>
          Ask about this workspace →
        </button> : <AskUnavailableNote className="rd-v2-rail-note" subject="this workspace" />}
      </RailStickyFooter>
    </RailFrame>
  );
}
