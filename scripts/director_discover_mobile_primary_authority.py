from pathlib import Path

jsx_path = Path("drive/src/v2/DiscoverEvaluationSurface.jsx")
css_path = Path("drive/src/v2/v2.css")
jsx = jsx_path.read_text()
css = css_path.read_text()

old = '''        <div className="rd-v2-eval-actions-wide">
          <button
            type="button"
            className="rd-v2-btn primary"
            disabled={probeLoading || submitting}
            onClick={() => runAction(primary.id)}
          >
            {primary.label}
          </button>
          {secondary.map((action) => (
            <button
              key={action.id}
              type="button"
              className="rd-v2-btn"
              disabled={probeLoading || submitting}
              onClick={() => runAction(action.id)}
            >
              {action.label}
            </button>
          ))}
        </div>

        <div className="rd-v2-eval-actions-mobile" aria-label="Focused candidate actions">
          <button
            type="button"
            className="rd-v2-btn primary rd-v2-eval-mobile-primary"
            disabled={probeLoading || submitting}
            onClick={() => runAction(primary.id)}
          >
            {primary.label}
          </button>

          {mobileSecondary || mobileOverflowActions.length ? (
'''
new = '''        <button
          type="button"
          className="rd-v2-btn primary rd-v2-eval-primary-action"
          disabled={probeLoading || submitting}
          onClick={() => runAction(primary.id)}
        >
          {primary.label}
        </button>

        <div className="rd-v2-eval-actions-wide" aria-label="Additional candidate actions">
          {secondary.map((action) => (
            <button
              key={action.id}
              type="button"
              className="rd-v2-btn"
              disabled={probeLoading || submitting}
              onClick={() => runAction(action.id)}
            >
              {action.label}
            </button>
          ))}
        </div>

        <div className="rd-v2-eval-actions-mobile" aria-label="Additional focused candidate actions">
          {mobileSecondary || mobileOverflowActions.length ? (
'''
assert old in jsx
jsx = jsx.replace(old, new, 1)
jsx_path.write_text(jsx)

old = '''.rd-v2-eval-workspace-shell > [data-testid="discover-eval-actions"] {
  flex-shrink: 0;
  max-width: 1080px;
  width: 100%;
  margin: 0 auto;
  padding: 0 20px 16px;
  background: #0f1724;
}

.rd-v2-eval-actions-wide {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
'''
new = '''.rd-v2-eval-workspace-shell > [data-testid="discover-eval-actions"] {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
  max-width: 1080px;
  width: 100%;
  margin: 0 auto;
  padding: 0 20px 16px;
  background: #0f1724;
}

.rd-v2-eval-actions-wide {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
'''
assert old in css
css = css.replace(old, new, 1)

old = '''  .rd-v2-eval-workspace-shell > [data-testid="discover-eval-actions"] {
    padding: 10px 12px max(12px, env(safe-area-inset-bottom));
    border-top: 1px solid #2a3a52;
    background: rgba(15, 23, 36, 0.97);
    box-shadow: 0 -10px 24px rgba(2, 8, 18, 0.2);
  }

  .rd-v2-eval-actions-wide {
    display: none;
  }

  .rd-v2-eval-actions-mobile {
    display: grid;
    gap: 9px;
  }

  .rd-v2-eval-mobile-primary {
    width: 100%;
    min-height: 44px;
    justify-content: center;
    font-weight: 700;
  }
'''
new = '''  .rd-v2-eval-workspace-shell > [data-testid="discover-eval-actions"] {
    display: grid;
    gap: 9px;
    padding: 10px 12px max(12px, env(safe-area-inset-bottom));
    border-top: 1px solid #2a3a52;
    background: rgba(15, 23, 36, 0.97);
    box-shadow: 0 -10px 24px rgba(2, 8, 18, 0.2);
  }

  .rd-v2-eval-actions-wide {
    display: none;
  }

  .rd-v2-eval-actions-mobile {
    display: grid;
    gap: 9px;
  }

  .rd-v2-eval-primary-action {
    width: 100%;
    min-height: 44px;
    justify-content: center;
    font-weight: 700;
  }
'''
assert old in css
css = css.replace(old, new, 1)
css_path.write_text(css)
