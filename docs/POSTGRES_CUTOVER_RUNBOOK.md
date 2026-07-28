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
8. Trocar `DATABASE_URL` da API para PostgreSQL somente depois da validacao e
   configurar `CRM_DATABASE_PROVIDER=postgresql`.
9. Confirmar que o build versionado usa `npm run prisma:generate:runtime`.
10. Deploy da API com worker desligado.
11. Smoke test: `/health`, login, tenants, funil, clientes, agenda e automacoes.
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

- Trocar `DATABASE_URL` da API para PostgreSQL apenas apos importacao validada.
- Configurar `CRM_DATABASE_PROVIDER=postgresql`; se essa variavel divergir da
  URL, o startup deve falhar antes de iniciar a API.
- Confirmar build provider-aware:
  `npm --prefix backend run prisma:generate:runtime`.
- Deploy da API com `AUTOMATION_WORKER_ENABLED` ausente ou `false`.
- Confirmar `/health` 200 e ausencia de erro Prisma.

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

- Se a API falhar antes de liberar escrita, restaurar `DATABASE_URL` SQLite e o
  deployment anterior da API.
- Se a falha ocorrer depois da troca, congelar escrita, preservar o PostgreSQL
  para analise, restaurar o deployment SQLite e apontar novamente para o volume
  SQLite intacto.
- Nao usar `git reset`, force push, seed, `db push` ou limpeza manual de dados.
- Reabrir escrita somente apos smoke test do banco restaurado.

## Criterios para abortar

- Divergencia de contagens ou relacoes.
- Falha de autenticacao ou isolamento multi-tenant.
- Worker ativo por engano.
- Regra ativa fora da JavaGro.
- PostgreSQL com dados antes da baseline sem autorizacao.
- Segredo exposto em log.
- Qualquer chamada externa inesperada.

## Estado atual

- Codigo de preparacao foi adicionado localmente.
- Nenhum cutover executado.
- Nenhuma variavel Railway alterada.
- Worker continua desligado.
- Piloto JavaGro continua sem execucao real nesta etapa.
