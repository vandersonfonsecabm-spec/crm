# Banco, migrations e release

AI_COMMERCE_SOURCE_COMMIT=a45eba71aede67546cf1459b0955e80e6586bff9
AI_COMMERCE_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9

Migrations aditivas:

1. `20260824150000_add_ai_commerce_catalog_foundation`
2. `20260824160000_add_ai_commerce_persistent_audit_effects`

Schema SQLite validado; schema PostgreSQL derivado validado; architecture gate
PASS com relação 157 e manifesto `52544dffd716eb60969b33adc050452fc702bb7ed622afb81188e9cb383733a0`.

Rehearsal SQLite em cópia isolada da base aplicou 39 migrations e o gate
post-migration confirmou 157 relações, 230 FKs, 30 unique parents, 0 órfãos e
0 vínculos cruzados. O mesmo gate foi aplicado ao banco oficial após a
migration; o banco oficial passou com 157/157 relações, 239 FKs verificadas e
0 órfãos/0 cruzamentos.

O runner oficial Prisma foi reproduzido uma vez e parou com erro genérico do
engine antes da execução. Portanto:

`PRISMA_OFFICIAL_RUNNER=KNOWN_TOOLING_BLOCKER_WITH_EQUIVALENT_LOCAL_SQLITE_EVIDENCE`

Isso não equivale a PASS do runner Prisma. A migration oficial, porém, foi
aplicada pelo mecanismo operacional PostgreSQL validado e conferida por gate
SQL/runtime independente; o runner permanece BLOCKED, nunca foi promovido a
PASS.

No preflight oficial, o alvo foi identificado como Railway project
`glistening-playfulness`, environment `production`, service `Postgres-u_yI`.
O banco está online e recebeu apenas as duas migrations E6A aditivas. O plano
Hobby não oferece Backups/PITR gerenciados; por isso foi criado backup lógico
protegido, sem conteúdo no repositório: 64,627,065 bytes, SHA-256
`8fae9053054dca2e7ac5099715e698851f7de024eebabf6f1470c94fa19064af`.
Esse backup foi restaurado no alvo isolado `e6a_restore_20260824`, onde todas as
16 migrations e o runtime OFF passaram.

`PRODUCTION_DB_IDENTIFIED=PASS`
`PRODUCTION_BACKUP=PASS_LOGICAL_PROTECTED_BACKUP`
`RESTORE_DRILL=PASS`
`PRODUCTION_MIGRATION=PASS_ADDITIVE`
`POST_MIGRATION_GATE=PASS`

API/worker foram publicados no merge SHA `a45eba71aede67546cf1459b0955e80e6586bff9`
com flags AI retornadas a false/allowlist 0; `/health` e `/ready` retornaram
200. Live Mock canary API passou; QA visual autenticado permanece
`BLOCKED_SESSION`.
