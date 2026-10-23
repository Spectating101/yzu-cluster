import { AskUnavailableNote } from "@/v2/askNote";
import {
  RailEntityHeader,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";

export function SynthesisIdleRailPanel({ onAskAbout }) {
  return (
    <RailFrame>
      <RailEntityHeader
        title="No build selected"
        description="Choose a build to see its method, inputs and readiness here."
      />
      <RailStickyFooter>
        {onAskAbout ? <button type="button" className="rd-v2-btn sm" onClick={() => onAskAbout()}>
          Ask about this workspace →
        </button> : <AskUnavailableNote className="rd-v2-rail-note" subject="this workspace" />}
      </RailStickyFooter>
    </RailFrame>
  );
}
