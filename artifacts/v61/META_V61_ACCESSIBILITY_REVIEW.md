# Accessibility review

Verified in the authenticated DOM:

- queue controls expose aria-pressed and the filter trigger exposes
  aria-expanded/aria-controls pointing to inbox-filters-drawer;
- context/filter dialogs have stable ids and focus-return behavior;
- heading and conversation focus fallbacks exist for next/assignment/empty paths;
- timestamps expose full labels while keeping visual HH:mm compact;
- simulated outbound announces “não enviada” rather than claiming delivery;
- rail toggle supports click, Enter and Space with changing accessible labels;
- collapsed navigation links retain accessible names/tooltips;
- message/list/context panes have independent scrolling and no horizontal overflow.

Automated axe was unavailable in the connected browser session, so this is a
manual DOM/ARIA/keyboard review rather than an automated axe assertion.
