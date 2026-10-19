import { useEffect, useState } from "react";
import { getResearchProfile } from "./researchProfileApi.js";
import { profileFocus } from "./libraryFocus.js";

const NONE = { signedIn: false, terms: [], label: "", topics: [] };

export function useResearchFocus(enabled, revision = 0) {
  const [focus, setFocus] = useState(NONE);
  useEffect(() => {
    if (!enabled) {
      setFocus(NONE);
      return undefined;
    }
    let cancelled = false;
    getResearchProfile()
      .then((document) => {
        if (!cancelled) setFocus(profileFocus(document));
      })
      .catch(() => {
        if (!cancelled) setFocus(NONE);
      });
    return () => { cancelled = true; };
  }, [enabled, revision]);
  return focus;
}
