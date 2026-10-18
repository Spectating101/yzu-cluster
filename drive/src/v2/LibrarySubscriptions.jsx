import { useEffect, useState } from "react";
import { listSubscriptions } from "@/v2/api";
import { licensedRowsLocked } from "@/v2/licensedAccess";

const STATES = {
  ready: { label: "Ready to query", pill: "rd-v2-status-ready" },
  members: { label: "Members only", pill: "rd-v2-status-connected" },
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
      <span className={`rd-v2-status-pill ${state.pill}`}><span className="rd-v2-status-dot" aria-hidden />{state.label}</span>
      {detail ? <span className="rd-v2-subscription-detail">{detail}</span> : null}
    </>
  );
  return row && onOpen
    ? <li><button type="button" className="rd-v2-subscription-product is-openable" onClick={() => onOpen(row)}>{body}</button></li>
    : <li><div className="rd-v2-subscription-product">{body}</div></li>;
}

export function LibrarySubscriptions({ datasets = [], onSelectDataset }) {
  const [state, setState] = useState({ vendors: null, failed: false });
  useEffect(() => {
    let cancelled = false;
    listSubscriptions()
      .then((payload) => { if (!cancelled) setState({ vendors: Array.isArray(payload?.vendors) ? payload.vendors : [], failed: false }); })
      .catch(() => { if (!cancelled) setState({ vendors: null, failed: true }); });
    return () => { cancelled = true; };
  }, []);
  if (!state.vendors?.length) return null;
  const byId = new Map(datasets.map((row) => [row.dataset_id, row]));
  return (
    <section className="rd-v2-subscriptions" aria-label="University subscriptions" data-testid="library-subscriptions">
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
