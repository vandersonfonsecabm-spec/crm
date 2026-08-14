# Accessibility report

## Verified

- Queue select has an accessible name and native keyboard interaction.
- Filter trigger and drawer have a resolving `aria-controls`/`aria-expanded` relationship.
- Result changes, including zero results, are announced by a polite screen-reader status.
- Selected conversation remains a real button with selected state.
- `Próxima` has the unambiguous accessible name `Abrir próxima pendência`.
- Pagination exposes `Página anterior` and `Próxima página`.
- Timestamp contract remains `<time>`/full accessible datetime; no fake delivery/read status was added.
- Focus fallbacks for next, selection changes, overlays, and the new-message viewport remain in place.
- DOM checks found no horizontal overflow in the authenticated desktop/mobile captures.

## Limitations

- An automated axe runner was not exposed in this environment (`AXE_AUTOMATED_RUN=NOT_AVAILABLE`). The release evidence therefore uses manual DOM/ARIA/keyboard checks plus the focused accessibility contracts; it does not claim an automated axe result.
- Existing unrelated lint warnings remain outside the V63 diff.
