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

## Checklist curta Railway

1. Congelar escrita na aplicacao ou colocar janela de manutencao.
2. Confirmar ultimo backup SQLite e registrar horario.
3. Criar PostgreSQL gerenciado vazio.
4. Rodar conectividade contra PostgreSQL de teste:
   `npm --prefix backend run db:postgres:check`.
5. Aplicar baseline PostgreSQL em banco vazio:
   `CRM_POSTGRES_MIGRATE_CONFIRM=apply-empty-postgres npm --prefix backend run db:migrate:postgres:empty`.
6. Importar snapshot SQLite:
   `POSTGRES_IMPORT_MODE=apply CRM_POSTGRES_IMPORT_CONFIRM=copy-sqlite-to-postgres npm --prefix backend run db:import:sqlite-to-postgres`.
7. Validar contagens:
   `POSTGRES_IMPORT_MODE=validate npm --prefix backend run db:import:sqlite-to-postgres`.
8. Configurar `POSTGRES_DATABASE_URL` na API com o PostgreSQL validado, manter
   `DATABASE_URL` apontando para o SQLite de rollback e configurar
   `CRM_DATABASE_PROVIDER=postgresql`.
9. Confirmar que o build versionado usa `npm run prisma:generate:runtime`.
10. Deploy da API com worker desligado.
11. Smoke autenticado somente leitura: `/health`, login, `/auth/me`,
   `/clientes`, detalhe de cliente, notas e Cliente 360 quando houver cliente.
12. Configurar o worker dedicado com a mesma `DATABASE_URL`, ainda desligado.
13. Somente em tarefa posterior, ativar worker e piloto JavaGro.

## Sequencia detalhada

### 1. Congelamento e backup

- Bloquear novas escritas comerciais durante a janela.
- Exportar snapshot consistente do SQLite do volume da API.
- Preservar o arquivo original intacto; o importador abre a origem em modo
  somente leitura quando o runtime suporta.
- Nao executar `prisma db push`, reset ou seed.

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

O smoke operacional usa credenciais temporarias fornecidas no momento da janela,
somente em memoria:

- `CRM_SMOKE_API_URL`;
- `CRM_SMOKE_EMAIL`;
- `CRM_SMOKE_PASSWORD`;
- `CRM_SMOKE_EMPRESA_SLUG`, apenas quando o e-mail existir em mais de um tenant.

Executar `npm --prefix backend run smoke:postgres:readonly` depois da API subir.
O script faz `POST /auth/login` apenas para obter a sessao e, depois, somente
`GET /auth/me`, `GET /clientes?page=1&limit=1`, `GET /clientes/:id`,
`GET /clientes/:id/notas` e `GET /clientes/:id/360` quando existir cliente.
Ele nao imprime token, cookie, senha ou payload sensivel e nao chama rotas de
automacao, WhatsApp, e-mail, webhook ou escrita comercial.

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

## Estado atual

- Codigo de preparacao foi adicionado localmente.
- Nenhum cutover executado.
- Nenhuma variavel Railway alterada.
- Worker continua desligado.
- Piloto JavaGro continua sem execucao real nesta etapa.
