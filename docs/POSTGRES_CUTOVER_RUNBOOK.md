# Runbook de cutover SQLite -> PostgreSQL

Este documento prepara uma janela futura de migracao do banco operacional do CRM
SaaS. Ele nao autoriza cutover imediato. A producao atual permanece em SQLite
no volume do servico `api` ate aprovacao explicita.

## Objetivo

Migrar o banco persistente SQLite para um PostgreSQL gerenciado para que a API e
o servico dedicado de automacoes compartilhem o mesmo banco. O worker deve
continuar desligado durante o cutover e so pode ser ativado em etapa posterior.

## Pre-requisitos

- Janela de manutencao aprovada.
- Backup testado do SQLite do volume da API.
- PostgreSQL gerenciado criado, vazio e acessivel pela Railway.
- `POSTGRES_TARGET_URL` disponivel apenas como segredo operacional.
- `POSTGRES_DATABASE_URL` planejada para a API no cutover, sem substituir a
  `DATABASE_URL` SQLite enquanto o rollback ainda for necessario.
- Build validado com `CRM_DATABASE_PROVIDER=postgresql npm --prefix backend run prisma:generate:runtime`.
- Migration baseline validada com `npm --prefix backend run prisma:postgres:migration-sql`.
- Importador validado em banco de ensaio.
- Uma replica para `api` e uma replica para `automation-worker`.
- `AUTOMATION_WORKER_ENABLED=false` no `api` e no worker durante o cutover.
- `AUTOMATION_PILOT_TRIGGER_ENABLED` ausente ou `false`.
- Build com o guard de `CRM_MAINTENANCE_READ_ONLY` publicado e validado.
- Token autenticado de curta duracao preparado somente em memoria para o smoke
  de leitura durante o freeze. O login normal atualiza `ultimoLoginEm`.

## Checklist curta Railway

1. Configurar `CRM_MAINTENANCE_READ_ONLY=true` somente na API e aguardar o
   restart/deploy minimo.
2. Provar o freeze: `/health` 200, leitura autenticada 200, uma requisicao HTTP
   mutavel recebe `503`/`MAINTENANCE_READ_ONLY`, worker inativo e nenhuma
   contagem do SQLite muda.
3. Confirmar ultimo backup SQLite e registrar horario.
4. Criar PostgreSQL gerenciado vazio.
5. Rodar conectividade contra PostgreSQL de teste:
   `npm --prefix backend run db:postgres:check`.
6. Aplicar baseline PostgreSQL em banco vazio:
   `CRM_POSTGRES_MIGRATE_CONFIRM=apply-empty-postgres npm --prefix backend run db:migrate:postgres:empty`.
7. Importar snapshot SQLite:
   `POSTGRES_IMPORT_MODE=apply CRM_POSTGRES_IMPORT_CONFIRM=copy-sqlite-to-postgres npm --prefix backend run db:import:sqlite-to-postgres`.
8. Validar contagens:
   `POSTGRES_IMPORT_MODE=validate npm --prefix backend run db:import:sqlite-to-postgres`.
9. Configurar `POSTGRES_DATABASE_URL` na API com o PostgreSQL validado, manter
   `DATABASE_URL` apontando para o SQLite de rollback e configurar
   `CRM_DATABASE_PROVIDER=postgresql`.
10. Confirmar que o build versionado usa `npm run prisma:generate:runtime`.
11. Deploy da API com worker desligado e maintenance ainda ativo.
12. Smoke autenticado somente leitura com token curto em memoria: `/health`, `/auth/me`,
   `/clientes`, detalhe de cliente, notas e Cliente 360 quando houver cliente.
13. Remover `CRM_MAINTENANCE_READ_ONLY` ou configurar `false`, aguardar a API
    ficar saudavel e confirmar novamente provider e leituras.
14. Configurar o worker dedicado com o PostgreSQL, ainda desligado.
15. Somente em tarefa posterior, ativar worker e piloto JavaGro.

## Sequencia detalhada

### 1. Congelamento e backup

- Configurar `CRM_MAINTENANCE_READ_ONLY=true` somente no servico `api`.
- Aguardar o restart/deploy minimo e confirmar o log sanitizado
  `maintenance_read_only_enabled`, sem dump de ambiente.
- Confirmar `/health` 200 e uma leitura autenticada segura.
- Confirmar que `POST`, `PUT`, `PATCH` e `DELETE` retornam HTTP `503` com
  `MAINTENANCE_READ_ONLY`. O callback GET do Bling tambem deve retornar `503`
  porque ele troca estado OAuth e pode persistir dados.
- O guard central bloqueia `create`, `createMany`, `update`, `updateMany`,
  `upsert`, `delete`, `deleteMany`, equivalentes com retorno, SQL raw mutavel e
  transacoes que tentem executar essas operacoes. Somente consultas raw
  `SELECT` estaticas, auditadas e marcadas no codigo sao permitidas.
- O startup pula migrations enquanto maintenance estiver ativo, e o worker
  recusa iniciar mesmo que seu gate seja ligado por engano.
- Nao executar, durante o freeze, scripts administrativos, seeds, importadores,
  Prisma Studio ou qualquer processo separado da API apontado ao SQLite. O
  guard pertence ao processo da aplicacao e nao substitui controle operacional.
- Registrar contagens antes do freeze; depois de ativar, tentar os caminhos
  bloqueados previstos e confirmar que contagens e estado do SQLite nao mudam.
- Exportar snapshot consistente do SQLite do volume da API.
- Preservar o arquivo original intacto; o importador abre a origem em modo
  somente leitura quando o runtime suporta.
- Nao executar `prisma db push`, reset ou seed.
- Se `/health` cair, uma escrita for aceita, um job surgir ou o volume deixar
  de ficar acessivel, desativar maintenance, manter SQLite e abortar o cutover.

### 2. Preparacao PostgreSQL

- Criar banco vazio.
- Definir `POSTGRES_TARGET_URL` somente no ambiente local/operacional seguro.
- Gerar schema PostgreSQL derivado:
  `npm --prefix backend run prisma:validate:postgres`.
- Aplicar baseline em banco vazio com confirmacao:
  `CRM_POSTGRES_MIGRATE_CONFIRM=apply-empty-postgres npm --prefix backend run db:migrate:postgres:empty`.

### 3. Importacao

O script `backend/scripts/migrate-sqlite-to-postgres.cjs` copia tabelas de
aplicacao em ordem de foreign keys, preserva IDs, timestamps, tenants, estados
e chaves de idempotencia, usa lotes e valida contagens.

Modos:

- `POSTGRES_IMPORT_MODE=dry-run`: lista origem e plano sem gravar.
- `POSTGRES_IMPORT_MODE=apply`: grava no destino; exige
  `CRM_POSTGRES_IMPORT_CONFIRM=copy-sqlite-to-postgres`.
- `POSTGRES_IMPORT_MODE=validate`: compara contagens origem/destino.

Variaveis:

- `SQLITE_SOURCE_PATH`: caminho local do snapshot SQLite.
- `POSTGRES_TARGET_URL`: URL PostgreSQL do destino.
- `POSTGRES_IMPORT_BATCH_SIZE`: padrao 500.

O script nao imprime URL, senha, token, cookie nem payload sensivel.

### 4. Cutover da API

- Nao sobrescrever a `DATABASE_URL` SQLite durante a primeira troca. Ela e o
  segredo operacional de rollback e deve continuar preservada na configuracao
  do servico `api`.
- Configurar o PostgreSQL validado em `POSTGRES_DATABASE_URL` e configurar
  `CRM_DATABASE_PROVIDER=postgresql`. O startup injeta a URL PostgreSQL como
  `DATABASE_URL` somente no processo filho do runtime Prisma/API.
- Se `CRM_DATABASE_PROVIDER=postgresql` nao encontrar `POSTGRES_DATABASE_URL`
  nem uma `DATABASE_URL` PostgreSQL, o startup falha antes de iniciar a API.
- Confirmar build provider-aware:
  `npm --prefix backend run prisma:generate:runtime`.
- Deploy da API com `AUTOMATION_WORKER_ENABLED` ausente ou `false`.
- Confirmar `/health` 200 e ausencia de erro Prisma.

### 4.1 Rollback sem exposicao de segredo

O rollback preferencial nao regrava o segredo SQLite:

1. manter `DATABASE_URL` com o valor SQLite anterior durante toda a janela;
2. aplicar PostgreSQL apenas em `POSTGRES_DATABASE_URL`;
3. em falha, configurar `CRM_DATABASE_PROVIDER=sqlite`;
4. remover `POSTGRES_DATABASE_URL` quando for seguro;
5. reiniciar/deployar minimamente a API e validar `/health` e leituras.

O helper local `npm --prefix backend run cutover:postgres:dry-run` simula esse
modelo sem chamar Railway real; os testes usam Railway mockado. Em operacao real, qualquer leitura de
variaveis via Railway CLI deve acontecer somente dentro de processo controlado:
`railway variable list --json` inclui valores crus e nao deve ter sua saida
copiada para logs, relatorios ou terminal compartilhado. Para aplicar segredos,
usar `railway variable set KEY --stdin`, nunca `KEY=valor` na linha de comando,
`setx`, `.env` ou arquivo temporario.

Se o procedimento em uso exigir sobrescrever `DATABASE_URL` e a unica copia do
valor SQLite antigo estiver apenas na memoria de uma sessao que pode ser
perdida, abortar o cutover. Esse desenho nao atende rollback seguro.

### 4.2 Smoke autenticado somente leitura

O login atualiza `Usuario.ultimoLoginEm` e, por isso, recebe `503` durante o
freeze. O smoke preferencial nessa etapa usa um token curto emitido pela propria
logica da aplicacao e mantido somente em memoria:

- `CRM_SMOKE_API_URL`;
- `CRM_SMOKE_BEARER_TOKEN`.

Executar `npm --prefix backend run smoke:postgres:readonly` depois da API subir.
Com bearer token, o script nao chama login e executa somente `GET /auth/me`,
`GET /clientes?page=1&limit=1`, `GET /clientes/:id`,
`GET /clientes/:id/notas` e `GET /clientes/:id/360` quando existir cliente.
O token deve expirar em ate cinco minutos, nunca ser gravado em `.env`, arquivo
ou linha de comando persistente, e deve ser removido da memoria ao concluir. O
script nao imprime token, cookie, senha ou payload sensivel e nao chama rotas
de automacao, WhatsApp, e-mail, webhook ou escrita comercial.

Fora do freeze, o mesmo smoke ainda pode usar `CRM_SMOKE_EMAIL`,
`CRM_SMOKE_PASSWORD` e `CRM_SMOKE_EMPRESA_SLUG` para validar o login real.

### 5. Worker dedicado

- Configurar o servico dedicado com a mesma `DATABASE_URL` PostgreSQL.
- Manter `AUTOMATION_WORKER_ENABLED=false`.
- Confirmar que o processo nao processa jobs.
- Ativacao do worker e piloto JavaGro ficam para uma tarefa posterior.

## Validacoes obrigatorias

- Contagens por tabela sem divergencia.
- Login e `/auth/me` preservando `empresaId`, papel e capabilities.
- JavaGro permanece isolada.
- CRM Agro SaaS principal permanece sem `AUTOMATIONS`.
- Regras, jobs, execucoes e eventos preservam idempotencia.
- Claim atomico e lease do worker validados contra PostgreSQL de teste.
- Nenhum WhatsApp, e-mail, webhook ou backfill disparado.

## Rollback

- Se a API falhar antes de liberar escrita, restaurar `CRM_DATABASE_PROVIDER`
  para `sqlite`, manter `DATABASE_URL` SQLite e o deployment anterior da API.
- Se a falha ocorrer depois da troca provider-aware, congelar escrita,
  preservar o PostgreSQL para analise, voltar `CRM_DATABASE_PROVIDER=sqlite`,
  remover `POSTGRES_DATABASE_URL` quando seguro, manter `DATABASE_URL` SQLite
  intacta e reiniciar/deployar minimamente a API.
- Nao usar `git reset`, force push, seed, `db push` ou limpeza manual de dados.
- Reabrir escrita somente apos smoke test do banco restaurado.
- Remover `CRM_MAINTENANCE_READ_ONLY` ou configurar `false` somente depois de
  confirmar que o provider restaurado esta saudavel.

## Criterios para abortar

- Divergencia de contagens ou relacoes.
- Falha de autenticacao ou isolamento multi-tenant.
- Worker ativo por engano.
- Regra ativa fora da JavaGro.
- PostgreSQL com dados antes da baseline sem autorizacao.
- Segredo exposto em log.
- Necessidade de sobrescrever `DATABASE_URL` sem copia de rollback comprovada.
- Falha do smoke autenticado somente leitura.
- Qualquer chamada externa inesperada.
- Valor invalido de `CRM_MAINTENANCE_READ_ONLY`.
- Qualquer tentativa mutavel que nao retorne `503` durante o freeze.
- Execucao de migration, job, produtor ou script administrativo durante o freeze.

## Estado atual

- Codigo de preparacao foi adicionado localmente.
- Nenhum cutover executado.
- Nenhuma variavel Railway alterada.
- Worker continua desligado.
- Piloto JavaGro continua sem execucao real nesta etapa.
