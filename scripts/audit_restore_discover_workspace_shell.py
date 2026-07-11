from pathlib import Path

jsx_path = Path("drive/src/v2/DiscoverEvaluationSurface.jsx")
css_path = Path("drive/src/v2/v2.css")
jsx = jsx_path.read_text()
css = css_path.read_text()

jsx_old = '  if (variant === "workspace") return body;\n'
jsx_new = '''  if (variant === "workspace") {
    return <div className="rd-v2-eval-workspace-shell">{body}</div>;
  }
'''
assert jsx_old in jsx, "workspace return contract not found"
jsx = jsx.replace(jsx_old, jsx_new, 1)

fixed_block = '''  .rd-v2-eval-workspace-shell > [data-testid="discover-eval-actions"] {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 24;
    display: grid;
    gap: 9px;
    max-width: none;
    width: auto;
    margin: 0;
    padding: 10px 12px max(12px, env(safe-area-inset-bottom));
    border-top: 1px solid #2a3a52;
    background: rgba(15, 23, 36, 0.97);
    box-shadow: 0 -10px 24px rgba(2, 8, 18, 0.2);
  }

  .rd-v2-eval-workspace {
    padding-bottom: 132px;
  }
'''
natural_block = '''  .rd-v2-eval-workspace-shell > [data-testid="discover-eval-actions"] {
    display: grid;
    gap: 9px;
    max-width: none;
    width: 100%;
    margin: 0;
    padding: 10px 12px max(12px, env(safe-area-inset-bottom));
    border-top: 1px solid #2a3a52;
    background: rgba(15, 23, 36, 0.97);
    box-shadow: 0 -10px 24px rgba(2, 8, 18, 0.2);
  }
'''
assert fixed_block in css, "fixed footer workaround block not found"
css = css.replace(fixed_block, natural_block, 1)

jsx_path.write_text(jsx)
css_path.write_text(css)
