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
- Build rastreado: `npm run prisma:generate:runtime`, sem repetir `npm ci` no comando customizado.
- Start rastreado: `npm run start:production`.
- Entrypoint final: `backend/src/server.js`.
- Health check: `/health`.
- Build nao executa seed, `prisma db push` ou migration.
- Start rastreado executa `backend/scripts/start-production.cjs`, que valida o
  ambiente Railway e roda `prisma migrate deploy` no conteiner principal,
  depois da montagem do volume e antes da API aceitar requisicoes.
- Com `CRM_MAINTENANCE_READ_ONLY=true`, o startup valida provider e volume,
  gera o Prisma Client correto, pula migrations e inicia a API com uma barreira
  central de escrita. `/health` e leituras permanecem disponiveis; metodos HTTP
  mutaveis retornam `503`, o worker nao inicia e mutacoes Prisma/SQL raw sao
  bloqueadas antes de chegar ao banco.
- O worker de automacoes internas permanece desligado por padrao. A H8.1
  separa a fundacao em processo dedicado (`npm run worker:automations` dentro
  de `backend/`); o processo HTTP nao inicia polling. Quando uma release futura
  autorizar sua ativacao, `AUTOMATION_WORKER_ENABLED=true` ou `1` deve ser
  configurado somente no processo dedicado do backend oficial, mantendo uma
  unica replica SQLite e sem usar Pre-Deploy.
- H8.2 introduz o produtor controlado e o endpoint temporario de piloto. O
  servico HTTP pode receber `AUTOMATION_PILOT_TRIGGER_ENABLED=true` apenas
  durante o piloto autorizado, e a variavel deve voltar a ficar ausente ou
  `false` ao final. O endpoint somente aceita evento sintetico `LEAD_CREATED`,
  tenant derivado da sessao, operador da plataforma, capability `AUTOMATIONS` e
  payload fechado; ele nao executa acao nem cria dado comercial.
- O servico dedicado do worker deve ser criado no mesmo projeto Railway, sem
  dominio publico, Root Directory `backend`, Start Command
  `npm run worker:automations`, uma unica replica, `AUTOMATIONS_ENABLED=true` e
  `AUTOMATION_WORKER_ENABLED=true`. O servico `api` deve manter
  `AUTOMATION_WORKER_ENABLED` ausente ou `false`.

O Root Directory configurado no painel da plataforma nao e verificavel pelo repositorio. Antes de uma futura publicacao, ele deve ser confirmado por processo de release; uma configuracao incorreta na raiz falhara pelo root runtime guard em vez de iniciar o Nest.

## SQLite em producao

O provider operacional atual e SQLite. `CRM_DATABASE_PROVIDER` fica ausente ou
`sqlite`, e `DATABASE_URL` deve ser definida explicitamente para um arquivo em
armazenamento persistente. Um filesystem efemero perde dados entre recriacoes. O
runtime bloqueia o banco de desenvolvimento rastreado `backend/prisma/dev.db` em
producao e nao imprime a URL configurada.

O caminho do volume pertence a configuracao da plataforma e nao e definido neste repositorio. Nao ha seed nem `db push` no deploy. Migrations automaticas existem somente no startup do Railway oficial. Em SQLite, o startup usa o schema canonico `backend/prisma/schema.prisma` com `DATABASE_URL` dentro do volume persistente e uma unica replica.

## Preparacao PostgreSQL futura

O bloqueio operacional do worker dedicado vem do SQLite preso ao volume do
servico `api`. Para uma fase futura, o repositorio agora possui scripts de
preparacao PostgreSQL sem alterar a producao atual:

- `npm --prefix backend run prisma:validate:postgres`: deriva e valida schema
  PostgreSQL em `%TEMP%`.
- `npm --prefix backend run prisma:generate:postgres`: gera Prisma Client para
  PostgreSQL durante uma janela aprovada.
- `npm --prefix backend run prisma:generate:runtime`: gera o Prisma Client do
  provider selecionado por `CRM_DATABASE_PROVIDER`.
- `npm --prefix backend run prisma:postgres:migration-sql`: expoe para inspecao
  a migration PostgreSQL versionada mais recente.
- `CRM_POSTGRES_MIGRATE_CONFIRM=apply-empty-postgres npm --prefix backend run db:migrate:postgres:empty`:
  aplica a baseline em um PostgreSQL vazio explicitamente informado.
- `npm --prefix backend run db:import:sqlite-to-postgres`: ensaia ou executa a
  copia SQLite -> PostgreSQL com confirmacao separada.
- `npm --prefix backend run db:postgres:check`: verifica conectividade sem
  imprimir segredo.
- `npm --prefix backend run cutover:postgres:dry-run`: simula localmente o fluxo
  seguro de cutover/rollback sem chamar Railway real.
- `npm --prefix backend run smoke:postgres:readonly`: executa smoke autenticado
  somente leitura durante janela autorizada, com credenciais temporarias em
  memoria.

O cutover real deve seguir `docs/POSTGRES_CUTOVER_RUNBOOK.md`. Durante a
primeira troca, manter `DATABASE_URL` apontando para o SQLite de rollback,
configurar o PostgreSQL em `POSTGRES_DATABASE_URL`, configurar
`CRM_DATABASE_PROVIDER=postgresql`, validar contagens, relacoes, login, tenants,
automacoes e rollback. Durante o cutover, o worker permanece desligado; a
ativacao do piloto JavaGro e do worker fica para tarefa posterior.

## Variaveis por nome

- `NODE_ENV`
- `PORT`
- `CRM_DATABASE_PROVIDER`
- `CRM_MAINTENANCE_READ_ONLY`
- `DATABASE_URL`
- `POSTGRES_TEST_DATABASE_URL`
- `POSTGRES_TARGET_URL`
- `POSTGRES_DATABASE_URL`
- `CRM_POSTGRES_MIGRATE_CONFIRM`
- `CRM_POSTGRES_IMPORT_CONFIRM`
- `POSTGRES_IMPORT_MODE`
- `POSTGRES_IMPORT_BATCH_SIZE`
- `SQLITE_SOURCE_PATH`
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
- `EXTERNAL_PROVIDER_ACTIVATION_ENABLED`
- `BLING_EXTERNAL_NETWORK_ENABLED`
- `PLATFORM_ADMIN_EMAILS`
- `AUTOMATION_WORKER_ENABLED`
- `AUTOMATION_WORKER_BATCH_SIZE`
- `AUTOMATION_WORKER_POLL_INTERVAL_MS`
- `AUTOMATION_WORKER_LEASE_MS`
- `AUTOMATION_WORKER_EXECUTION_TIMEOUT_MS`
- `AUTOMATION_WORKER_MAX_ATTEMPTS`
- `AUTOMATION_PILOT_TRIGGER_ENABLED`

`CRM_MAINTENANCE_READ_ONLY` aceita estritamente `true`/`1` para ativar e
`false`/`0` ou ausencia para desativar. Valor diferente falha fechado. O modo
serve somente para a janela de cutover: ele nao troca provider ou URL, nao roda
migrations e nao substitui backup. Scripts administrativos, seeds, importadores
e outros processos separados da API devem permanecer parados durante o freeze.

`PLATFORM_ADMIN_EMAILS` e uma allowlist operacional separada por virgulas,
normalizada com `trim` e comparacao case-insensitive. Quando ausente ou vazia,
nega acesso por padrao. Ela somente marca usuarios autenticados, ativos e ja
existentes como operadores da plataforma e nunca deve ser exposta ao frontend,
logs ou mensagens de erro. ADMIN e GERENTE continuam sendo papeis de tenant,
sem autoridade global.

`EXTERNAL_PROVIDER_ACTIVATION_ENABLED` permanece ausente ou `false` enquanto
uma missao de ativacao externa nao estiver autorizada. As rotas de OAuth,
credenciais e sincronizacao falham fechado nesse estado; a UI de Integracoes
continua somente leitura. `BLING_EXTERNAL_NETWORK_ENABLED` e um marcador
operacional adicional do fingerprint: ele tambem precisa permanecer ausente ou
`false` para que o runtime declare outbound externo desabilitado.

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

### Observabilidade do worker de automacoes

Cada linha do worker e JSON independente com `event`, `timestamp`, `service`,
`workerInstanceId` e `provider`. Quando aplicavel, inclui somente IDs tecnicos
de tenant, regra, job, execucao e evento, alem de `actionType`, `triggerType`,
`attempt`, `maxAttempts`, `durationMs`, `status`, `retryAt`, `leaseUntil`,
`final`, `willRetry`, `permanent`, `retryable`, `failureReason`, `errorClass`,
`errorCode`, `errorName` e mensagem generica. `worker_started` registra tambem
o intervalo de polling.

O ciclo de sucesso emite `job_claimed`, `execution_started`, `action_started`,
`action_succeeded` e `job_succeeded`, nessa ordem. `job_found` nao e emitido:
antes do claim atomico ele poderia duplicar em corrida e nao acrescentava uma
transicao confirmada. `action_failed` informa somente que a acao lancou erro,
sem antecipar decisao de retry ou encerramento. Uma falha recuperavel emite
depois da persistencia `job_attempt_failed` e `job_retry_scheduled`. Em erro
permanente, `job_permanent_failure` precede o `job_failed` definitivo. Na
ultima tentativa, `job_attempt_failed` precede `job_attempts_exhausted` e
`job_failed`. `job_attempts_exhausted` aparece somente quando
`attempt >= maxAttempts`; os eventos de decisao informam `final`, `willRetry`
e `failureReason`. `retryable` descreve a natureza tecnica do erro, enquanto
`willRetry` e a decisao operacional autoritativa para aquela tentativa. A
recuperacao real de lease expirado emite
`job_lease_recovered` antes do novo `job_claimed`.

O processo emite `worker_started`, `worker_stopping` e `worker_stopped`. Uma
falha do ciclo de polling, antes ou fora de um claim confirmado, usa
`worker_poll_error`; ela nao e registrada como falha de job. Polling vazio nao
emite evento de job nem linha periodica em nivel normal.

Mensagens inesperadas nao sao copiadas para o log: o worker publica mensagem
generica por classe/codigo tecnico. O callback recebe um unico envelope
allowlisted; `Error` bruto, campos desconhecidos e objetos aninhados sao
descartados. Identificadores de erro aceitam somente valores tecnicos
reconhecidos e usam fallback seguro. A sanitizacao defensiva tambem cobre
Authorization Basic/Bearer, JWT, Cookie e Set-Cookie completos, URLs, strings
de conexao, e-mail, telefone, CPF/CNPJ, senha, token, secret, API key e
estruturas Prisma com `meta`, `target`, `data`, `args` ou `input`. Mensagens
ficam limitadas a 240 caracteres. Payloads, headers, stacks, objetos Prisma e
dumps de ambiente nao sao serializados. Exemplo sanitizado:

```json
{"event":"job_retry_scheduled","timestamp":"2030-01-01T00:00:00.000Z","service":"automation-worker","workerInstanceId":"worker-example","provider":"postgresql","tenantId":10,"ruleId":20,"jobId":30,"executionId":40,"actionType":"CREATE_INTERNAL_EVENT","triggerType":"LEAD_CREATED","attempt":1,"maxAttempts":3,"durationMs":12,"status":"FALHOU","retryAt":"2030-01-01T00:01:00.000Z","final":false,"willRetry":true,"failureReason":"RETRYABLE_ERROR"}
```

Limitacao preexistente, fora desta mudanca de observabilidade: o adiamento por
janela ocorre depois do claim incrementar `tentativas`. No limite configurado,
isso pode consumir a ultima tentativa sem executar a acao. O fluxo deve ser
corrigido e validado em tarefa funcional separada; este patch nao altera essa
logica.

H8.2 separa produtor e worker: o produtor cria somente execucoes e
`AutomacaoAcaoJob` idempotentes a partir de evento sintetico protegido; o worker
dedicado reivindica e processa os jobs. `CREATE_INTERNAL_EVENT` permanece a
unica acao suportada nesta fase. O evento tecnico de saida nao alimenta o
produtor novamente, evitando recursao. O piloto operacional deve ativar a regra
somente pelo tempo necessario, emitir um evento, confirmar uma execucao
concluida e desativar a regra antes de remover o gate temporario.

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
