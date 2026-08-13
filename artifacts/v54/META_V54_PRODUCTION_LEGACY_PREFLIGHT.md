# Production Legacy Preflight

Status: `PASS` (pre-migration and immediate post-migration verification)

- Database identity: official Railway production PostgreSQL, major 18.4; database metadata only.
- Migration history before apply: 8 completed, 0 failed/unfinished/rolled back. After apply: 9 completed, 0 unfinished/failed/rolled back.
- Legacy Cliente statuses: `Contato=2`, `Fechado=1`, `Lead=9`, `Novo=1`, `Proposta=2`; no legacy `Arquivado` rows.
- Legacy Cliente archive column: absent as expected before migration.
- Nota orphan count: 0. Active locks relevant to the migration: 0.
- Legacy Nota foreign key was Cascade before the V52 migration; the rehearsal changed it to Restrict.
- The final pre-migration check was rerun immediately before the official mutation; the same target identity and zero-lock result were confirmed.
- Post-migration history and invariants are retained as sanitized metadata in the release evidence; no production rows or PII were exported.
