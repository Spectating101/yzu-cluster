from pathlib import Path

p = Path('e2e/v2-synthesis.spec.js')
s = p.read_text()
orig = s

for title, next_title, trigger in [
    (
        'starts reviewable method reasoning from a grounded construction',
        'refreshes the canvas in the same Ask turn that records a proposal',
        'await page.getByRole("button", { name: "Start method reasoning" }).click();',
    ),
    (
        'refreshes the canvas in the same Ask turn that records a proposal',
        'creates a durable thread quietly, then hands mapped evidence to Ask only on explicit reasoning',
        'await page.getByRole("button", { name: "Discuss construction in Ask" }).click();',
    ),
]:
    start_marker = f'  test("{title}", async ({{ page }}) => {{'
    end_marker = f'  test("{next_title}", async ({{ page }}) => {{'
    start = s.index(start_marker)
    end = s.index(end_marker, start)
    block = s[start:end]
    select = '    await selectThread(page, "Historical stablecoin attention");\n'
    route = '    await page.route("**/library/synthesis/threads/thread-attention", (route) =>\n'
    if block.count(select) != 1:
        raise SystemExit(f'{title}: expected one selectThread, got {block.count(select)}')
    if block.count(route) != 1:
        raise SystemExit(f'{title}: expected one thread route, got {block.count(route)}')
    if block.count(trigger) != 1:
        raise SystemExit(f'{title}: expected one trigger, got {block.count(trigger)}')
    block = block.replace(select, '', 1)
    block = block.replace(route, select + route, 1)
    s = s[:start] + block + s[end:]

if s == orig:
    raise SystemExit('no fixture-order changes')
p.write_text(s)
print('fixture order corrected')
