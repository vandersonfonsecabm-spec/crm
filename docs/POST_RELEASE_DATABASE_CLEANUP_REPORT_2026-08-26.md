# Limpeza dos PostgreSQL extras — relatório de auditoria

Data: 2026-08-26
Escopo: auditoria do comando, inventário global e inspeção read-only dos dois
Postgres candidatos no projeto Railway oficial. Nenhum serviço, volume,
variável, deployment ou dado foi alterado.

## Resultado final

```text
POST_RELEASE_DATABASE_CLEANUP=NO_DELETE_SAFE
OFFICIAL_POSTGRES=Postgres-u_yI
OFFICIAL_POSTGRES_CHANGED=false
Postgres=UNKNOWN_PRESERVE
Postgres-MpW9=UNKNOWN_PRESERVE
ORPHAN_CONFIRMED_COUNT=0
BACKUPS_CREATED_FOR_CANDIDATES=0
STOPS=0
DELETES=0
PRODUCTION_HEALTH=PASS
PRODUCTION_READY=PASS
PRODUCTION_ERRORS=0
```

## Correções feitas no comando

- Nomes deixaram de ser identidade suficiente: qualquer ação futura deve
  confirmar `projectId`, `environmentId`, `serviceId` e `volumeId`.
- `ORPHAN_CONFIRMED` passou a exigir ausência comprovada de dependências,
  finalidade descartável, dados únicos, backup/restore e consumidor
  intermitente. Dados não classificados ficam `UNKNOWN_PRESERVE`.
- A busca foi ampliada para todos os projetos/environments Railway, serviços,
  referências Railway, GitHub/repositório e metadados Vercel disponíveis.
- O probe global foi corrigido para não tratar `Postgres` genérico, `PGDATA` ou
  `CRM_DATABASE_PROVIDER` como referências de banco.
- O probe PostgreSQL foi corrigido para usar endpoint público do alvo com a
  credencial efetiva da API quando necessário; a `DATABASE_PUBLIC_URL` do
  serviço oficial estava stale e falhava com `28P01`.
- Exclusão de serviço e volume permanece separada, individual e condicionada a
  revalidação imediata; nenhum stop/delete foi tentado.

## Inventário Railway global

- `glistening-playfulness / production`: API `api`, worker `crm`, banco oficial
  `Postgres-u_yI`, candidatos `Postgres` e `Postgres-MpW9`.
- `glistening-playfulness / ga3-bundle-staging`: `ga3-bundle-api` usa o banco
  `Postgres--e25`; este recurso é `IN_USE` no staging e não é candidato.
- `crm-postgres-test / production`: possui outro serviço `Postgres`, com ID e
  endpoint próprios; não deve ser confundido com o `Postgres` candidato do
  projeto oficial.
- `crm-agro-meta-homolog` e `protective-nurturing` usam SQLite/parados e não
  apontam para os candidatos.

## Candidatos de produção

### `Postgres`

- Serviço: `d22addf0-538b-4532-a288-b98a0a66ecae`.
- Volume: `8dd3aea5-2931-45d3-b461-5149499ae56d`, 5 GB, aproximadamente 298 MB
  usados, estado `READY`.
- PostgreSQL 18.6, database `railway`, schema `public`, aproximadamente
  18,2 MB de database size, 83 tabelas, 16 migrations aplicadas e zero falhas.
- Contagens agregadas: Empresa 2, Usuário 3, Cliente 7, Lead 1, Negócio 1,
  MensagemCanal 21, Produto 4, Acompanhamento 2, MovimentacaoEstoque 3;
  PropostaComercial/ItemPropostaComercial/ProductOffer/Catalog 0.
- Timestamps mais recentes de dados chegam a 28/07/2026; o conjunto se parece
  com snapshot/rehearsal anterior, mas isso não prova que seja descartável.
- `pg_stat_activity` estava sem conexões no instante da inspeção. A consulta de
  rede Railway mostrou fluxos `service` na porta 5432 durante o lookback; a
  origem não foi identificada e parte do tráfego pode ser o próprio probe via
  proxy. Por segurança, o estado é `UNKNOWN_PRESERVE`.

### `Postgres-MpW9`

- Serviço: `c10e8f8d-8eaf-4ec8-8344-a485823051e9`.
- Volume: `71cbec41-a7f0-4221-9071-9585da4669d4`, 5 GB, aproximadamente 162 MB
  usados, estado `READY`.
- PostgreSQL 18.6, database `railway`, schema `public`, aproximadamente
  13,5 MB de database size, 41 tabelas, 1 migration aplicada e zero falhas.
- Contagens agregadas semelhantes ao primeiro banco: Empresa 2, Usuário 3,
  Cliente 7, Lead 1, Negócio 1, MensagemCanal 21, Produto 4, Acompanhamento 2,
  MovimentacaoEstoque 3; sem propostas.
- Timestamps mais recentes de dados chegam a 28/07/2026. Parece clone/teste
  histórico, mas ainda há dados e não existe prova de proprietário/finalidade
  descartável. `pg_stat_activity` estava sem conexões no instante da inspeção.
- Classificação: `UNKNOWN_PRESERVE`.

## Dependências externas

- API e worker oficiais referenciam somente `Postgres-u_yI`.
- `ga3-bundle-api` referencia somente `Postgres--e25` no staging.
- Nenhum ID/host candidato apareceu no código, documentação ou configuração
  local além dos próprios probes/relatórios.
- O repositório não contém `.github/workflows`; isso não prova configurações
  externas de Actions fora do conteúdo acessível.
- Vercel produção continua no deployment promovido do runtime `eb1cadb`; o
  preview mais recente da branch documental é separado. Não foi feita leitura
  de valores de env Vercel para evitar segredo; não há prova de referência aos
  candidatos.

## Por que não houve backup/stop/delete

O comando exigia backup e restore drill para um banco `ORPHAN_CONFIRMED`. Nenhum
candidato atingiu esse estado: ambos têm dados, finalidade histórica não
resolvida e, no caso de `Postgres`, tráfego de serviço não atribuído. Criar
backups adicionais de dados reais sem necessidade também aumentaria a superfície
de exposição. Portanto, a decisão segura é preservar os dois.

## Próximo lote seguro

1. Identificar o consumidor do tráfego TCP do `Postgres` e o proprietário de
   cada volume por metadados Railway, sem expor secrets.
2. Confirmar se os dados são apenas fixtures/snapshots descartáveis com o
   responsável do ambiente.
3. Só após `ORPHAN_CONFIRMED` comprovado, criar backup/restore drill e suspender
   um serviço por vez. Se qualquer gate permanecer desconhecido, manter
   `UNKNOWN_PRESERVE`.

Relatórios relacionados:

- `docs/POST_RELEASE_INFRA_HYGIENE_REPORT_2026-08-26.md`
- `docs/POST_RELEASE_INFRA_HYGIENE_STAGE1_3_REPORT_2026-08-26.md`
- `docs/CODEX_STATE.md`
