# META V56 — Sidebar report

Status: `SIDEBAR_COMPACT_WIDTH=PASS` and `SIDEBAR_COLLAPSE_REAL=PASS` by source and focused-contract evidence.

- Expanded width token: `224px` (down from `232px`).
- Collapsed rail: `68px`.
- Collapse/expand control remains present, keyboard reachable, has changing `aria-label`, `aria-expanded`, `aria-controls`, visible focus styling, and native `title` tooltip.
- `crm-sidebar-collapsed` localStorage preference remains the source of persistence across reload and route changes.
- The collapsed brand mark is retained at `24px`, so the rail is not an anonymous toggle-only strip.
- Inbox attention badge and active-state selectors were not changed.
- Main width gain is `156px` at the target desktop widths.

The 1024–1199 tablet media behavior is existing shell policy and was not redesigned because V56 is desktop-focused; mobile/drawer behavior was intentionally left intact.
