# CRM Agro SaaS

CRM para atendimento e gestão comercial, com frontend React/Vite e backend Express + Prisma/SQLite.
A migracao futura para PostgreSQL esta preparada por scripts e runbook, mas o
cutover de producao ainda nao foi executado.

## Estrutura

- `frontend/`: frontend oficial React/Vite publicado pela configuração Vercel.
- `backend/`: único backend operacional, com Express, Prisma e SQLite.
- `src/` e `prisma/`: Nest/PostgreSQL legado congelado, fora do runtime e do deploy.
- `docs/ARCHITECTURE.md`: fonte de verdade da arquitetura.
- `docs/DEPLOYMENT.md`: comandos e restrições de publicação.
- `docs/POSTGRES_CUTOVER_RUNBOOK.md`: preparacao, cutover e rollback SQLite -> PostgreSQL.
- `docs/LEGACY_NEST.md`: limites do código legado preservado.

## Comandos explícitos

Na raiz, comandos genéricos de runtime falham de propósito para impedir que o Nest seja iniciado por engano.

```bash
npm run backend:dev
npm run backend:start
npm run backend:test
npm --prefix backend run prisma:validate:postgres
npm run frontend:dev
npm run frontend:build
npm run frontend:lint
npm run verify:architecture
```

## Backend Express

Configure `backend/.env` a partir de `backend/.env.example`, gere o cliente Prisma e inicie a API:

```bash
cd backend
npm run prisma:generate:runtime
npm start
```

O acesso exige uma empresa e um administrador persistidos. Para criar o primeiro administrador local, defina as variáveis `BOOTSTRAP_COMPANY_NAME`, `BOOTSTRAP_COMPANY_SLUG`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` somente no ambiente local e execute:

```bash
npm run admin:create
```

O script não contém credenciais fixas e recusa sobrescrever uma empresa existente.

## Frontend

```bash
cd frontend
npm run dev
```

Para apontar o frontend para a API:

```bash
VITE_API_URL=http://localhost:3001
```

Abra `http://localhost:5173` e autentique-se pelo formulário normal. Sem uma sessão validada em `/auth/me`, nenhuma tela privada é montada.

O Railway deve usar `backend/` como Root Directory. O Vercel constrói exclusivamente `frontend/`. O build nao executa seed nem `prisma db push`; em producao, o startup versionado do backend roda `prisma migrate deploy` somente no Railway oficial, depois do volume SQLite persistente estar montado e antes da API iniciar.

## Preparacao PostgreSQL

O schema SQLite em `backend/prisma/schema.prisma` permanece canonico para o
runtime atual. O build/start seleciona explicitamente o provider por
`CRM_DATABASE_PROVIDER`, com default `sqlite` para preservar a producao atual.
Para cutover PostgreSQL, configure `CRM_DATABASE_PROVIDER=postgresql` junto da
`DATABASE_URL` PostgreSQL; se provider e URL divergirem, o startup falha antes
de iniciar a API. A preparacao PostgreSQL deriva um schema equivalente em
`%TEMP%` para validacao, geracao do Prisma Client PostgreSQL e baseline
migration:

```bash
npm --prefix backend run prisma:generate:runtime
npm --prefix backend run prisma:validate:postgres
npm --prefix backend run prisma:postgres:migration-sql
```

Para um banco PostgreSQL vazio de teste:

```bash
set POSTGRES_TEST_DATABASE_URL=postgresql://crm_saas_test:crm_saas_test@127.0.0.1:54329/crm_saas_test?schema=public
set CRM_POSTGRES_MIGRATE_CONFIRM=apply-empty-postgres
npm --prefix backend run db:migrate:postgres:empty
```

Para ensaiar importacao de snapshot SQLite:

```bash
set SQLITE_SOURCE_PATH=C:\caminho\snapshot.db
set POSTGRES_TARGET_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public
set POSTGRES_IMPORT_MODE=dry-run
npm --prefix backend run db:import:sqlite-to-postgres
```

O modo `apply` exige `CRM_POSTGRES_IMPORT_CONFIRM=copy-sqlite-to-postgres`.
Nao coloque credenciais reais no repositorio.

## Automacoes internas

A H7 adiciona automacoes internas locais para regras por tenant, execucoes,
jobs por acao, round-robin, Acompanhamentos automaticos, simulacao sem efeitos
e historico tecnico. A H8.1 endurece a fundacao do worker em processo dedicado
(`npm run worker:automations` no backend), controlado por
`AUTOMATION_WORKER_ENABLED` e desligado por padrao. O processo HTTP nao inicia
polling. Nesta fundacao, a execucao real do worker suporta somente
`CREATE_INTERNAL_EVENT`; outras acoes falham de forma definitiva e sanitizada.
A ativacao futura exige uma unica replica SQLite, backup e protocolo de release.
Nenhuma automacao envia WhatsApp, e-mail, SMS, push, webhook ou mensagem externa.
O worker emite uma linha JSON sanitizada por transicao confirmada do job, com
IDs tecnicos, tipo da acao, tentativa, status e duracao. Polling vazio nao gera
log de job, e payloads, dados pessoais, tokens, cookies e URLs de banco nunca
fazem parte do contrato de observabilidade. Callbacks recebem somente um
envelope allowlisted, sem `Error`, stack ou objetos aninhados. `action_failed`
registra apenas que a acao lancou erro; a decisao persistida aparece em
`job_attempt_failed`, `job_retry_scheduled`, `job_permanent_failure`,
`job_attempts_exhausted` e no `job_failed` definitivo, com campos `final`,
`willRetry` e `failureReason`.
A H8.2 adiciona um produtor interno controlado para evento sintetico
`LEAD_CREATED` do piloto, protegido por `AUTOMATION_PILOT_TRIGGER_ENABLED` e
sem criar Lead, Cliente, Negocio ou Acompanhamento. O endpoint temporario apenas
enfileira jobs idempotentes; a execucao continua exclusiva do worker dedicado.

## Operacoes da plataforma

A H7.1 adiciona uma area interna em `/platform/tenants` para operadores da
plataforma localizarem tenants e ativarem ou desativarem somente a capability
`AUTOMATIONS` de forma individual, transacional e auditada. A H7.2 adiciona o
provisionamento interno de tenant com primeiro usuario ADMIN, tambem restrito ao
operador da plataforma. O acesso usa `PLATFORM_ADMIN_EMAILS` como allowlist
deny-by-default de usuarios autenticados e ativos; ADMIN e GERENTE continuam
limitados ao proprio tenant. Esta area nao possui impersonacao, nao ativa
capability automaticamente, nao ativa worker, nao cria regras e nao executa
automacoes.
