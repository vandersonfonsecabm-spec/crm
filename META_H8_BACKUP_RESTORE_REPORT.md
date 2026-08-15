# H8 — Backup e restore

`BACKUP=BLOCKED_EXTERNAL_DATABASE_ACCESS`
`RESTORE_DRILL=BLOCKED_EXTERNAL_DATABASE_ACCESS`
`PROD_MIGRATION=NOT_RUN`

A migration aditiva so pode ser executada apos backup identificavel do PostgreSQL
oficial, restore drill e DB_PRECHECK. Como a URL/credencial segura nao foi
exposta neste ambiente, nenhum comando de banco de producao foi tentado.
