# Deploy operacional

Nenhum deploy foi executado durante a oficializacao desta arquitetura.

## Vercel

- Publica somente `frontend/`.
- O manifesto da raiz instala o frontend, executa seu build e publica `frontend/dist`.
- O fallback de SPA permanece configurado.
- Vercel nao executa Express, Nest, Prisma, seed ou migration.

## Railway

- Plataforma do backend Express.
- Root Directory esperado: `backend`.
- As dependencias sao instaladas uma unica vez pela fase automatica do Nixpacks.
- Build rastreado: `npx prisma generate`, sem repetir `npm ci` no comando customizado.
- Start rastreado: `npm run start:production`.
- Entrypoint final: `backend/src/server.js`.
- Health check: `/health`.
- Build nao executa seed, `prisma db push` ou migration.
- Start rastreado executa `backend/scripts/start-production.cjs`, que valida o
  ambiente Railway e roda `prisma migrate deploy` no conteiner principal,
  depois da montagem do volume e antes da API aceitar requisicoes.
- O worker de automacoes internas permanece desligado por padrao. A H8.1
  separa a fundacao em processo dedicado (`npm run worker:automations` dentro
  de `backend/`); o processo HTTP nao inicia polling. Quando uma release futura
  autorizar sua ativacao, `AUTOMATION_WORKER_ENABLED=true` ou `1` deve ser
  configurado somente no processo dedicado do backend oficial, mantendo uma
  unica replica SQLite e sem usar Pre-Deploy.

O Root Directory configurado no painel da plataforma nao e verificavel pelo repositorio. Antes de uma futura publicacao, ele deve ser confirmado por processo de release; uma configuracao incorreta na raiz falhara pelo root runtime guard em vez de iniciar o Nest.

## SQLite em producao

O provider operacional atual e SQLite. `DATABASE_URL` deve ser definida explicitamente para um arquivo em armazenamento persistente. Um filesystem efemero perde dados entre recriacoes. O runtime bloqueia o banco de desenvolvimento rastreado `backend/prisma/dev.db` em producao e nao imprime a URL configurada.

O caminho do volume pertence a configuracao da plataforma e nao e definido neste repositorio. Nao ha seed nem `db push` no deploy. Migrations automaticas existem somente no startup do Railway oficial, com `DATABASE_URL` SQLite dentro do volume persistente e uma unica replica.

## Variaveis por nome

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `FRONTEND_URL`
- `ALLOWED_ORIGINS`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `ALLOW_COMPANY_REGISTRATION`
- `INTEGRATION_ENCRYPTION_KEY`
- `BLING_CLIENT_ID`
- `BLING_CLIENT_SECRET`
- `BLING_REDIRECT_URI`
- `BLING_TIMEOUT_MS`
- `BLING_MAX_PAGES`
- `BLING_PAGE_SIZE`
- `PLATFORM_ADMIN_EMAILS`
- `AUTOMATION_WORKER_ENABLED`
- `AUTOMATION_WORKER_BATCH_SIZE`
- `AUTOMATION_WORKER_POLL_INTERVAL_MS`
- `AUTOMATION_WORKER_LEASE_MS`
- `AUTOMATION_WORKER_EXECUTION_TIMEOUT_MS`
- `AUTOMATION_WORKER_MAX_ATTEMPTS`

`PLATFORM_ADMIN_EMAILS` e uma allowlist operacional separada por virgulas,
normalizada com `trim` e comparacao case-insensitive. Quando ausente ou vazia,
nega acesso por padrao. Ela somente marca usuarios autenticados, ativos e ja
existentes como operadores da plataforma e nunca deve ser exposta ao frontend,
logs ou mensagens de erro. ADMIN e GERENTE continuam sendo papeis de tenant,
sem autoridade global.

O bootstrap seguro de operacoes da plataforma deve publicar primeiro o codigo,
confirmar o proprio e-mail via `/auth/me`, configurar somente
`PLATFORM_ADMIN_EMAILS` no Railway oficial e renovar a sessao. O endpoint interno
`POST /platform/tenants` cria tenant e primeiro usuario ADMIN sem habilitar
`/auth/register-company`, sem enviar e-mail, sem ativar capabilities, sem criar
regras e sem iniciar worker.

Defaults H8.1 do worker dedicado: lote 5, polling 5000 ms, lease 60000 ms,
timeout de acao 30000 ms e maximo de 3 tentativas. Valores invalidos voltam ao
default seguro e o lote/polling/timeout nunca ficam ilimitados. A fundacao H8.1
processa somente jobs existentes de `CREATE_INTERNAL_EVENT`, com claim atomico,
lease recuperavel, idempotencia por `actionKey`/`idempotencyKey`, logs
estruturados sanitizados e shutdown por `SIGTERM`/`SIGINT`. Acoes comerciais ou
externas nao suportadas falham sem efeito e sem retry infinito.

## Render

O Render nao e uma plataforma ativa deste CRM. O manifesto da raiz foi removido porque executava `prisma db push` e seed automaticamente. Nenhuma configuracao Render permanece apta a autodeteccao.

## Checklist de release futuro

1. Executar `npm run verify:architecture`.
2. Aprovar testes Express, lint e build do frontend.
3. Confirmar Root Directory `backend` no Railway por processo autorizado.
4. Confirmar armazenamento persistente e variaveis apenas por nome.
5. Verificar `/health` antes de liberar trafego.
6. Confirmar que migrations futuras foram auditadas, testadas em sandbox,
   acompanhadas de backup e compativeis com rollout gradual antes de confiar no
   startup automatico.
7. Em rollback, selecionar o artefato anterior e preservar o arquivo SQLite persistente; qualquer restauracao de banco exige procedimento separado e autorizado.
