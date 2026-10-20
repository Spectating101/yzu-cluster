import { useEffect, useState } from "react";
import { listSubscriptions } from "@/v2/api";
import { licensedRowsLocked } from "@/v2/licensedAccess";
import { LockMark, LockTag } from "@/v2/Lock";

let subscriptionsRequest = null;

function useSubscriptions() {
  const [state, setState] = useState({ vendors: null, failed: false });
  useEffect(() => {
    let cancelled = false;
    subscriptionsRequest ||= listSubscriptions().catch((error) => { subscriptionsRequest = null; throw error; });
    subscriptionsRequest
      .then((payload) => { if (!cancelled) setState({ vendors: Array.isArray(payload?.vendors) ? payload.vendors : [], failed: false }); })
      .catch(() => { if (!cancelled) setState({ vendors: null, failed: true }); });
    return () => { cancelled = true; };
  }, []);
  return state;
}

const STATES = {
  ready: { label: "Ready to query", pill: "rd-v2-status-ready" },
  members: { label: "Members only", pill: "rd-v2-status-locked", locked: true },
  preparing: { label: "On the drive, being prepared", pill: "rd-v2-status-review" },
  needs_export: { label: "Needs a manual export", pill: "rd-v2-status-review" },
  held_unsafe: { label: "Held, not safe to use yet", pill: "rd-v2-status-review" },
  not_collected: { label: "In the subscription, not collected", pill: "rd-v2-status-external" },
  not_in_subscription: { label: "Not in our subscription", pill: "rd-v2-status-unknown" },
};

export function productState(product, row) {
  return product.state === "ready" && licensedRowsLocked(row) ? "members" : product.state;
}

function Product({ product, row, onOpen }) {
  const state = STATES[productState(product, row)] || STATES.not_collected;
  const facts = [
    product.row_count ? `${Number(product.row_count).toLocaleString("en-US")} rows` : "",
    product.coverage || "",
  ].filter(Boolean).join(" · ");
  const detail = facts || product.note || product.summary;
  const body = (
    <>
      <span className="rd-v2-subscription-name">{product.name}</span>
      <span className={`rd-v2-status-pill ${state.pill}`}>{state.locked ? <LockMark /> : <span className="rd-v2-status-dot" aria-hidden />}{state.label}</span>
      {detail ? <span className="rd-v2-subscription-detail">{detail}</span> : null}
    </>
  );
  return row && onOpen
    ? <li><button type="button" className="rd-v2-subscription-product is-openable" onClick={() => onOpen(row)}>{body}</button></li>
    : <li><div className="rd-v2-subscription-product">{body}</div></li>;
}

const HELD = new Set(["ready", "members", "preparing"]);

export function LibrarySubscriptionStrip({ datasets = [], onSeeAll }) {
  const state = useSubscriptions();
  if (!state.vendors?.length) return null;
  const licensedOpen = datasets.some((row) => row?.licensed && row?.rows_available !== false);
  const held = state.vendors.reduce((total, vendor) => total + vendor.products.filter((product) => HELD.has(product.state)).length, 0);
  return (
    <div className="rd-v2-subscription-strip" data-testid="library-subscription-strip" role="group" aria-label="University subscriptions">
      <span className="rd-v2-subscription-strip-label">University subscriptions</span>
      <span className="rd-v2-subscription-strip-vendors">
        {state.vendors.map((vendor) => {
          const count = vendor.products.filter((product) => HELD.has(product.state)).length;
          return <span key={vendor.id}><b>{vendor.name}</b>{count ? ` ${count}` : ""}</span>;
        })}
      </span>
      <span className="rd-v2-subscription-strip-held">{held} datasets held</span>
      {licensedOpen ? <em className="rd-v2-subscription-strip-open">Open to you</em> : <LockTag who="yuanze" />}
      {onSeeAll ? <button type="button" className="rd-v2-subscription-strip-more" onClick={onSeeAll}>See what we hold →</button> : null}
    </div>
  );
}

export function LibrarySubscriptions({ datasets = [], onSelectDataset }) {
  const state = useSubscriptions();
  if (!state.vendors?.length) return null;
  const byId = new Map(datasets.map((row) => [row.dataset_id, row]));
  return (
    <section className="rd-v2-subscriptions" id="library-subscriptions" aria-label="University subscriptions" data-testid="library-subscriptions">
      <div className="rd-v2-library-section-heading">
        <div>
          <span className="rd-v2-eyebrow">University subscriptions</span>
          <h2>What Yuan Ze licenses, and what we hold from it</h2>
        </div>
      </div>
      <div className="rd-v2-subscription-grid">
        {state.vendors.map((vendor) => (
          <article key={vendor.id} className="rd-v2-subscription-vendor" data-testid={`subscription-${vendor.id}`}>
            <header>
              <h3>{vendor.name}</h3>
              {vendor.holder ? <p>{vendor.holder}</p> : null}
            </header>
            <ul>
              {vendor.products.map((product) => (
                <Product
                  key={`${product.kind}:${product.dataset_id || product.name}`}
                  product={product}
                  row={product.dataset_id ? byId.get(product.dataset_id) : undefined}
                  onOpen={onSelectDataset}
                />
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
