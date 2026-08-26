# Relatório final — Liberação Proposta ↔ Catálogo V1

## Resultado

```text
COMMERCIAL_PROPOSAL_CATALOG_V1_PRODUCTION=PASS
POSTGRES_REAL_REHEARSAL_18_4=PASS
PRODUCTION_DB_PREFLIGHT=PASS
PRODUCTION_BACKUP=PASS
PRODUCTION_BACKUP_RESTORE_DRILL=PASS
MAINTENANCE_FREEZE=PASS
PRODUCTION_MIGRATION=PASS
PRODUCTION_SCHEMA_VALIDATION=PASS
LEGACY_COMPATIBILITY=READ_ONLY_SCHEMA_PASS_NO_LEGACY_ROWS
PRODUCTION_HEALTH=PASS
POST_RELEASE_OBSERVATION=PASS_SHORT_WINDOW
DISCOUNT_POLICY_STATUS=DEFERRED
AI_DISCOUNT_AUTHORITY=NOT_IMPLEMENTED
```

## Candidato e publicação

- Runtime efetivamente publicado: `eb1cadb8a692dea99a1c0edc888504d22be15a33`.
- Branch documental: `release/ga2-post-e6a`, com os commits posteriores ao runtime restritos a ferramentas e documentação; o SHA atual deve ser consultado diretamente no Git.
- Tag imutável do runtime publicado: `commercial-proposal-catalog-v1-production-pass-2026-08-26`, apontando para `eb1cadb8a692dea99a1c0edc888504d22be15a33`.
- API Railway oficial: projeto `glistening-playfulness`, produção, serviço `api`.
- API deployment candidato sob maintenance: `af132eb5-ce27-4332-a0af-6aa424200369`.
- API redeploy normal: `5bdfb9e8-2e36-4a8c-a177-9595efc36ac5`.
- Worker candidato: `db381e6e-3b3a-4c67-a3b9-06a3d52c74d5`.
- Vercel produção: projeto `crm`, deployment `dpl_GzT5h7Q7paK6mLr7ExAxbkBFFABh`, READY, alias `crm-murex-six-83.vercel.app`.
- O frontend foi promovido do Preview do branch candidato; não houve redesign nem alteração da otimização de bundle nesta missão.

## PostgreSQL oficial

Preflight read-only executado dentro da API oficial:

```text
provider=postgresql
server_version=18.6
database=railway
schema=public
timezone=Etc/UTC
database_bytes=233920191
applied_migrations=17
failed_migrations=0
v1Applied=true
activeMigrationRunners=0
```

Antes da migration, o banco tinha 16 migrations e `v1Applied=false`.

## Backup e restore drill

- Backup custom-format fora do repositório: `%TEMP%\crm-v1-official-backup-20260826\production.dump`.
- Tamanho: `7.110.164` bytes.
- SHA-256: `f4d9eaa6c97d77c694eed8259addc58a1fdb0b200b8c5c47704a65b46dbb4d4e`.
- `pg_dump` 18.6 e restore em PostgreSQL 18.6 descartável.
- `pg_restore --list`: `1.191` entradas.
- Restore concluído; migrations restauradas: `16`; falhas: `0`.
- Contagens restauradas: Empresa `2`, PropostaComercial `0`, ItemPropostaComercial `0`, ProductOffer `8`, CommercialCatalogProduct `1`.
- O dump contém dados reais e não foi anexado, commitado ou copiado para o relatório.

## Freeze, migration e validação

- `CRM_MAINTENANCE_READ_ONLY=true` verificado na API.
- `/health` e `/ready` permaneceram disponíveis.
- POST de teste retornou `503` durante o freeze.
- Worker foi removido durante a janela e publicado novamente após migration/smoke.
- Migration oficial executada uma única vez pelo runtime candidato.
- Migration concluída às `2026-08-26T04:46:43.274Z`.
- Após a migration: `empresaId` e `itemType` presentes, zero `empresaId` nulo, zero migration falhada e nenhum runner concorrente.
- Constraints V1 presentes e validadas: FKs tenant-scoped, CHECKs de contrato e RESTRICT; FK da proposta permanece CASCADE conforme contrato.
- Índices V1 presentes: unique tenant/id e quatro índices tenant-scoped.

## Smoke e observação

- API `/health`: `200`.
- API `/ready`: `200`, `database=ok`.
- Frontend canônico: `200` e Vercel `READY`.
- Worker publicou ciclos `stock_rule_evaluation_cycle` e `stock_worker_cycle` sem `failedTenants` ou `failedCount`.
- A produção não tinha propostas comerciais para executar smoke legacy/PDF sem criar dados; nenhum dado artificial foi criado.
- Testes mutáveis/cross-tenant continuam no rehearsal/staging, não em produção.

## Problemas encontrados e corrigidos

1. Host PostgreSQL privado não resolvia localmente; usei SSH dentro da API.
2. Variável do serviço Postgres estava stale; backup usou a credencial efetiva da API e o proxy TCP, sem exibir segredo.
3. `pg_dump --file=-` gerava dump vazio; removi o argumento e validei stream/bytes.
4. Variável de maintenance provocou redeploy automático do `master`; corrigi reimplantando o candidato local e usando `--skip-deploys` + `redeploy`.
5. Worker não parou apenas com flag; corrigi com `railway down` no serviço exato e só o publiquei novamente depois da migration/smoke.

## Limitações honestas

- A observação pós-release foi curta, não uma janela prolongada.
- Não havia propostas reais para validar abertura de legacy/PDF sem criar dados.
- O runtime final da API/Vercel/worker é `eb1cadb`; commits posteriores são ferramentas/documentação sem alteração nos paths de runtime do produto.

## Estado final

Produção está com a migration V1 aplicada, API e frontend saudáveis, worker compatível ativo e backup restaurável comprovado. Desconto, IA real, Meta, outbound, pedidos, pagamento e reserva continuam fora da V1.
