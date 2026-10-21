import { useEffect } from "react";

/** Hide covered centre controls from keyboard/AT without disabling the rail. */
export function useCentreOverlay(ref, open) {
  useEffect(() => {
    const overlay = ref.current;
    const main = overlay?.closest("main");
    if (!open || !main) return undefined;
    const previous = new Map();
    for (let branch = overlay; branch !== main; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch) continue;
        previous.set(sibling, sibling.inert);
        sibling.inert = true;
      }
    }
    return () => {
      for (const [element, inert] of previous) element.inert = inert;
    };
  }, [ref, open]);
}
