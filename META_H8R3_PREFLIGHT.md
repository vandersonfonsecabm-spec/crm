# H8R3 — Preflight somente leitura

## Checkpoint

- `H8R3_CHECKPOINT_SHA=82d0bd12df12338f17ea9873bd0cfc0d243e66e0`
- Branch: `feature/postgres-migration-prep`
- `origin/feature/postgres-migration-prep`: mesmo SHA
- `origin/master`: mesmo SHA
- `SOURCE_FUNCTIONAL_DIFF=NONE` entre HEAD e o checkpoint.
- Worktree: sujo apenas com artefatos/documentos preexistentes da H8/H8R2 e outro trabalho do usuário; não foram removidos nem revertidos.
- `backend/prisma/dev.db` SHA-256: `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533` (preservado).

## Runtime e infraestrutura

- Railway oficial: projeto `glistening-playfulness`, ambiente de produção; serviços API `api` e worker `crm`.
- API e worker estão saudáveis no SHA do checkpoint; `/health` respondeu HTTP 200.
- Frontend oficial respondeu HTTP 200.
- `H8_NOTIFICATIONS_ENABLED`: ausente/desligada na API e no worker.
- `NOTIFICATIONS_WORKER_ENABLED`: ausente/desligada no worker.
- `AUTOMATION_WORKER_ENABLED`: habilitada somente no worker, estado H7 preexistente; não foi alterada.

## Banco oficial — somente leitura

- PostgreSQL oficial identificado e acessível pelo mecanismo oficial de shell autenticado, sem imprimir credenciais.
- Gate tenant read-only: `safe=true`, PostgreSQL, 91/91 relações verificadas, `orphaned=0`, `crossed=0`, transação revertida.
- Agregados H8: `Empresa=2`, `ConfiguracaoNotificacaoEmpresa=0`, `habilitada=true=0`, tenants H8 ativos=0.
- Não houve escrita, migration, backup novo ou restore novo nesta retomada.

## Sessão e tenant

- Foi localizada e validada uma aba Chrome autenticada no CRM oficial (`crm-murex-six-83.vercel.app`).
- A sessão apresenta usuário administrativo e dados QA sintéticos (negócio/lead/follow-ups de teste), sem PII real usada como prova.
- O identificador numérico do tenant não foi inferido a partir da UI; será confirmado pelo contexto autenticado antes da ativação.
- Tenant alvo permanece desligado; nenhum tenant foi habilitado.

## Gate

`CHECKPOINT_REVALIDATED=PASS` para a descoberta: Git, source funcional, runtime, flags, banco e sessão permanecem compatíveis com o checkpoint H8R2. A ativação continua pendente de revisão Sol e de mutation operacional explícita.
