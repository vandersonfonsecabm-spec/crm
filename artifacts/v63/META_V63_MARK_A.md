# V63 Mark A — baseline V61

- Runtime baseline: `411c99c04147cb049dbbb7446c6be2e59669ad01`.
- Final runtime after the V63 frontend release: `f57620e1e9ea91d395387ff48f12d3f3768653bb`.
- Branch: `feature/postgres-migration-prep`; `origin/master` and `origin/feature` converge on the runtime SHA.
- Scope guard: frontend Inbox hierarchy only. No backend, Prisma, migration, schema, integration, provider, or outbound changes.
- Preserved contracts: V61 queues and mappings, assignment/lease/CAS, timestamps, simulated outbound truth, V58 shell, search, polling, context, composer, and mobile navigation.
- Before evidence was reused only where the related source was unchanged; new authenticated browser evidence was captured for the final runtime.

## Baseline inventory

- Existing command bar mixed title, queue wording, count, search, filters, and refresh.
- Queue and secondary filters were visually close but semantically different.
- List rows could present several competing indicators.
- Operational “Próxima pendência” and pagination “Próxima” needed unmistakable labels.
- Empty/polling pagination needed a real page-state clamp and an accessible zero-result announcement.

## Safe fixture

The browser run used the existing authenticated TEST_ONLY/sanitized CRM fixture. No real contact was created, no provider was called, and no outbound message was sent.
