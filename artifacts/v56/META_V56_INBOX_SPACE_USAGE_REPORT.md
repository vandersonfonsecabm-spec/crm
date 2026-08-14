# META V56 — Inbox space usage report

Status: `INBOX_HEADER_COMPACT=PASS`, `INBOX_HORIZONTAL_USAGE=PASS`, `INBOX_VERTICAL_USAGE=PASS`, `INBOX_PANEL_PROPORTIONS=PASS` by route-specific CSS and focused source contracts.

- Only `.crm-content--inbox` receives the full-workspace treatment; other routes retain their editorial frame.
- Inbox content becomes a flex column with `min-height:0` and `overflow:hidden`.
  In the live production cascade the effective outer inset was `34px` left,
  `34px` right and `40px` bottom (the generic shell padding wins over the
  narrower source-level route inset); this was accepted because the measured
  workspace still fills the available canvas without structural dead space.
- Header/command bar is fixed to a compact `48px` track with a `6px` workbench gap.
- No-context state uses `24% / 76%`; selected-context state uses `24% / 52% / 24%`, keeping Chat dominant.
- Conversation list, message viewport, and context pane retain independent minimum-height/overflow behavior; context values wrap long URLs with `overflow-wrap:anywhere` and `word-break:break-word`.
- The existing composer and message-history components are preserved; no Inbox request, lease, polling, status, or outbound logic changed.
- Existing filter drawer behavior is preserved (`.inbox-filters` remains unchanged) to avoid a scope expansion beyond the desktop shell.

The production Chrome DOM measurement confirmed the same geometry. At
1440×900 (collapsed rail), the workspace is `1304×720` with tracks
`312.6 / 677.2 / 312.6px`; the composer ends at `y=859.2px`. At 1366×768 it
is `1230.4×588` with tracks `294.9 / 639.0 / 294.9px`; the composer ends at
`y=727.2px`. Document horizontal overflow was `0` at both viewports and the
console was clean. Screenshots are the four `V56_AFTER_*` PNGs in this
directory.
