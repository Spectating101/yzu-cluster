import { deskErrorCopy } from "@/v2/deskErrorCopy";

/** A transport failure said in the reader's terms; the raw text stays as detail.
 *  Shared so every page reports a failed load the same way. */
export function DeskError({ raw, surface, alert = false }) {
  const copy = deskErrorCopy(raw, { surface });
  if (!copy) return null;
  return (
    <div className="s04-desk-error" role={alert ? "alert" : undefined} data-testid="desk-error">
      <strong>{copy.headline}</strong>
      <p>{copy.body}</p>
      <details>
        <summary>What the desk reported</summary>
        <code>{copy.detail}</code>
      </details>
    </div>
  );
}
