# META V56 — Inbox space usage report

Status: `INBOX_HEADER_COMPACT=PASS`, `INBOX_HORIZONTAL_USAGE=PASS`, `INBOX_VERTICAL_USAGE=PASS`, `INBOX_PANEL_PROPORTIONS=PASS` by route-specific CSS and focused source contracts.

- Only `.crm-content--inbox` receives the full-workspace treatment; other routes retain their editorial frame.
- Inbox content becomes a flex column with `min-height:0`, `overflow:hidden`, and a route-specific `8px 12px 12px` desktop inset.
- Header/command bar is fixed to a compact `48px` track with a `6px` workbench gap.
- No-context state uses `24% / 76%`; selected-context state uses `24% / 52% / 24%`, keeping Chat dominant.
- Conversation list, message viewport, and context pane retain independent minimum-height/overflow behavior; context values wrap long URLs with `overflow-wrap:anywhere` and `word-break:break-word`.
- The existing composer and message-history components are preserved; no Inbox request, lease, polling, status, or outbound logic changed.
- Existing filter drawer behavior is preserved (`.inbox-filters` remains unchanged) to avoid a scope expansion beyond the desktop shell.

The static geometry yields a 52% Chat track when context is visible and no structural bottom ocean in the route flex chain. Browser-authenticated DOM measurement was unavailable and is explicitly not claimed here.
