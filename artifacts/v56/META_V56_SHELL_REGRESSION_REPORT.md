# META V56 — Shell regression report

Allowlist verified: frontend shell/sidebar, Inbox layout/overlay, focused frontend tests, and V56 reports only. No backend, Prisma, migrations, integrations, or business-rule files changed.

- `Dashboard.tsx` adds only an Inbox route class and suppresses the duplicate generic header when the Inbox capability is enabled.
- If the Inbox feature is disabled, the generic unavailable-state header remains available.
- Root `select-none` was removed so Inbox message text can be selected; other pages keep their existing structure.
- Sidebar state/active links/badge code was not rewritten; only width/compact-brand CSS changed.
- Communication overlay close callback now uses a stable ref, preventing field edits from stealing focus or releasing body scroll-lock.
- Action-menu close returns focus to its summary trigger.
- Other routes retain their existing max-width and padding rules.
- Production Chrome smoke at `/visao-geral`, `/clientes` and `/integracoes`
  confirmed no document horizontal overflow; Inbox route returned to the
  collapsed rail without losing the preference.
- 390×844 sentinel hid the desktop rail and showed the existing mobile nav;
  no blank screen or horizontal overflow was observed.

Known non-blocking baseline lint findings are recorded in `META_V56_REGRESSION_REPORT`/final report; no new lint finding is attributed to V56.
