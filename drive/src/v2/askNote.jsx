import { createContext, useContext } from "react";

export const AskAccessContext = createContext(false);

export function AskUnavailableNote({ subject, className = "rd-v2-rail-note" }) {
  const signedIn = useContext(AskAccessContext);
  return (
    <span className={className} data-testid="ask-unavailable-note">
      {signedIn ? "Ask is not available right now; Resources shows the assistant's status." : `Sign in to Ask about ${subject}.`}
    </span>
  );
}
