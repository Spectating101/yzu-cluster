# Research Drive RC2.1 interaction motion standard

This standard governs decorative interaction feedback only. It does not add product capability, change information architecture, or alter readiness and runtime truth.

## Product posture

Research Drive is a dense, professor-facing enterprise research tool. Its default motion style is **productive**: fast, precise, predictable, and easy to ignore while concentrating on research work.

Expressive motion is reserved for rare system communication such as a toast entering. The resting interface must remain visually equivalent to accepted RC2.

## Motion tokens

| Token | Value | Use |
|---|---:|---|
| `--rd-decor-duration-press` | `70ms` | Button and control press response |
| `--rd-decor-duration-fade` | `110ms` | Hover, color, opacity, and top-level fades |
| `--rd-decor-duration-small` | `150ms` | Small transient panels and exit motion |
| `--rd-decor-duration-system` | `240ms` | Toasts and important system communication |
| `--rd-decor-ease-standard` | `cubic-bezier(0.2, 0, 0.38, 0.9)` | State changes visible throughout |
| `--rd-decor-ease-enter` | `cubic-bezier(0, 0, 0.38, 0.9)` | Elements entering the view |
| `--rd-decor-ease-exit` | `cubic-bezier(0.2, 0, 1, 0.9)` | Elements permanently leaving the view |

These values follow Carbon's productive-motion scale and easing definitions. Fluent and Apple independently reinforce the same governing principles: short, purposeful motion that communicates a relationship or status without delaying work.

## Component rules

### Top-level navigation

- Fade new page content in over `110ms`.
- Keep the header, sidebar, right rail, and spatial frame stable.
- Do not slide whole pages horizontally or vertically.

### Buttons and compact controls

- Hover may change background, border, color, or restrained shadow over `110ms`.
- Press may use a subtle `scale(0.985)` response over `70ms`.
- Do not animate labels, icons, or layout independently.
- Keyboard focus always uses a visible static outline; motion is supplementary.

### Dense rows and result lists

- Do not translate rows on hover. Dense research lists should not visually drift.
- Use background, border, and restrained shadow changes only.
- Resting and selected-state styling remains owned by RC2, not this layer.

### Popovers, menus, and transient panels

- Use entrance easing and `150ms` or less for small surfaces.
- Motion must originate from the triggering control or preserve obvious spatial continuity.
- Escape, outside-click, and keyboard focus behavior remain available immediately; animation never blocks interaction.

### Toasts and system messages

- Each new message receives a fresh identity so entrance motion and assistive announcements reliably restart.
- Enter over `240ms` using opacity and at most a few pixels of translation.
- Exit over `150ms`; do not disappear abruptly after the reading interval.
- Use `role="status"` with polite announcement for advisory success/information.
- Use `role="alert"` with assertive announcement only for urgent errors.
- Do not generate repeated or stacked notifications for routine events.
- A message must remain long enough to read or be recoverable elsewhere.

### Loading and operation feedback

- Skeletons are appropriate when the incoming content structure is known.
- Spinners or indeterminate activity rails are appropriate when duration is unknown.
- Determinate progress is allowed only when the backend reports measurable advancement.
- Never convert time-based presentation stages into a percentage or imply exact completion.
- Past timed cues remain numbered and neutral; they are not shown as verified completion.
- Live regions announce meaningful stage changes only. Elapsed timers remain silent to assistive technology.
- Operation indicators are transient and disappear when the operation completes.

### Lifecycle activity

- An active-state marker may receive one short emphasis pulse when the state appears or changes.
- Do not run sustained oscillating pulses on persistent queued or running items.
- Status is always communicated through text and color in addition to motion.

## Performance rules

- Movement animations use `transform` and `opacity`.
- Avoid animating layout properties such as width, height, top, left, margin, or padding.
- `will-change` is not applied pre-emptively; introduce it only after measured performance evidence.
- Keep animation local to the element receiving focus or reporting state.
- One shared token and easing authority governs the application; feature styles must not redefine competing motion systems.

## Accessibility rules

Under `prefers-reduced-motion: reduce`:

- all entrance, pulse, spinner, and progress-rail animation stops;
- transitions become effectively immediate;
- no meaning or state disappears;
- focus outlines and textual status remain intact.

Motion must never be the sole means of communicating selection, progress, success, warning, or failure.

## Rejection checklist

Remove or reject a decoration when any answer is “yes”:

1. Does it remain on screen merely to look premium?
2. Does it move a frequently used control every time it is used?
3. Does it delay the next action?
4. Does it imply progress the backend does not measure?
5. Does it create movement away from the active element?
6. Does it oscillate indefinitely without essential meaning?
7. Does reduced motion remove information rather than movement?
8. Does it animate layout or cause mobile overflow?
9. Does it create repeated assistive announcements for a ticking timer?
10. Does it duplicate or override another motion authority?
11. Is the average user likely to notice the animation itself rather than the state change?

## Primary references

- Apple Human Interface Guidelines — Motion: https://developer.apple.com/design/human-interface-guidelines/motion
- Apple Human Interface Guidelines — Progress indicators: https://developer.apple.com/design/human-interface-guidelines/progress-indicators
- Microsoft Fluent 2 — Motion: https://fluent2.microsoft.design/motion
- IBM Carbon Design System — Motion: https://carbondesignsystem.com/elements/motion/overview/
- IBM Carbon Design System — Progress bar: https://carbondesignsystem.com/components/progress-bar/usage/
- W3C WCAG 2.2 — Animation from interactions: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions
- W3C ARIA Authoring Practices — Alert pattern: https://www.w3.org/WAI/ARIA/apg/patterns/alert/
- web.dev — High-performance CSS animations: https://web.dev/articles/animations-guide
