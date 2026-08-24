# Banco, migrations e release

AI_COMMERCE_SOURCE_COMMIT=0fbd3bcbfbd884f740e4d1e0c5afd372fd88e3e9
AI_COMMERCE_RUNTIME_SHA=NOT_DEPLOYED

Migrations aditivas:

1. `20260824150000_add_ai_commerce_catalog_foundation`
2. `20260824160000_add_ai_commerce_persistent_audit_effects`

Schema SQLite validado; schema PostgreSQL derivado validado; architecture gate
PASS com relação 157 e manifesto `52544dffd716eb60969b33adc050452fc702bb7ed622afb81188e9cb383733a0`.

Rehearsal SQLite em cópia isolada da base aplicou 39 migrations e o gate
post-migration confirmou 157 relações, 230 FKs, 30 unique parents, 0 órfãos e
0 vínculos cruzados. O banco oficial não foi tocado.

O runner oficial Prisma foi reproduzido uma vez e parou com erro genérico do
engine antes da execução. Portanto:

`PRISMA_OFFICIAL_RUNNER=KNOWN_TOOLING_BLOCKER_WITH_EQUIVALENT_LOCAL_SQLITE_EVIDENCE`

Isso não equivale a PASS de migration PostgreSQL oficial. Backup/restore/
migration/deploy oficiais ficam para lote operacional com confirmação própria.

No preflight oficial, o alvo foi identificado como Railway project
`glistening-playfulness`, environment `production`, service `Postgres-u_yI`.
O banco está online, mas ainda não contém as tabelas E6A. A página de Backups
do Railway informa que Backups/PITR exigem plano Pro; no plano Hobby não há
backup oficial recuperável disponível.

`PRODUCTION_DB_IDENTIFIED=PASS`
`PRODUCTION_BACKUP=BLOCKED_RAILWAY_HOBBY_NO_BACKUPS_PITR`
`PRODUCTION_MIGRATION=NOT_EXECUTED`

O runtime atual permaneceu intacto.
