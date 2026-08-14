# Timestamp contract

- One separator per local calendar day: Hoje, Ontem or DD/MM/AAAA.
- Normal inbound/outbound messages display only HH:mm inside the bubble, aligned
  to the lower-right without delivery/read icons.
- Internal notes display Autor · HH:mm.
- Every visible timestamp is a time element with ISO dateTime and a full localized
  accessible label. Invalid timestamps fail safe and do not render Invalid Date.
- Provider chronology uses enviadaEm when present; ingestion createdAt is the
  deterministic fallback for legacy rows.
- Simulated outbound is explicitly labelled as simulation/not sent; no delivery
  state is invented.
