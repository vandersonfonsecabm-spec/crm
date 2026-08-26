# Auditoria de origem/finalidade dos PostgreSQL extras

Data: 2026-08-26
Escopo: investigação read-only dos candidatos `Postgres` e `Postgres-MpW9`,
com cobertura global de projetos/environments Railway, referências do repo,
GitHub e Vercel. Nenhuma exclusão, suspensão, variável ou dado foi alterado.

## Resultado

```text
DATABASE_ORIGIN_AUDIT=PASS_WITH_UNRESOLVED_PURPOSE
OFFICIAL_POSTGRES=Postgres-u_yI
OFFICIAL_POSTGRES_PROTECTED=true
Postgres=UNKNOWN_PRESERVE
Postgres-MpW9=UNKNOWN_PRESERVE
ORPHAN_CONFIRMED=0
BACKUP_FOR_CANDIDATES=NOT_CREATED_NOT_REQUIRED_YET
STOP_DELETE=0
```

## Evidência Railway

### `Postgres`

- Serviço `d22addf0-538b-4532-a288-b98a0a66ecae`.
- Volume `8dd3aea5-2931-45d3-b461-5149499ae56d`, 5 GB, ~298,5 MB usados,
  `READY`.
- Deployment atual `f8c0fb9c-9afb-4dae-b146-43dadb0ccfdf`, imagem PostgreSQL
  18 com digest imutável, motivo `autoupdate`, criado em 23/08/2026.
- Histórico também contém deployment removido de 28/07/2026.
- PostgreSQL 18.6, 83 tabelas, 16 migrations aplicadas, zero falhas e ~18,2
  MB de database size.
- Dados agregados: 2 empresas, 3 usuários, 7 clientes, 1 lead, 1 negócio,
  21 mensagens, 4 produtos, 3 movimentações; nenhuma proposta, item,
  `ProductOffer` ou produto de catálogo.
- Últimos timestamps de dados chegam a 28/07/2026. Contadores do banco
  (`pg_stat_database`) mostram inserts/updates/deletes históricos; não é um
  banco vazio nem uma instalação recém-criada.
- `pg_stat_activity` ficou sem conexões após o probe. Fluxos TCP `service` foram
  observados no lookback, mas a Railway não forneceu `peerServiceId`; como o
  probe também usa o proxy público, não é possível atribuir o tráfego a um
  consumidor específico.

**Classificação: `UNKNOWN_PRESERVE`.**

### `Postgres-MpW9`

- Serviço `c10e8f8d-8eaf-4ec8-8344-a485823051e9`.
- Volume `71cbec41-a7f0-4221-9071-9585da4669d4`, 5 GB, ~162,7 MB usados,
  `READY`.
- Deployment atual `ffe0f620-061a-4b14-9846-ded16b17a09d`, mesma imagem/digest
  PostgreSQL 18, motivo `autoupdate`, criado em 23/08/2026; há deployment
  removido de 28/07/2026.
- PostgreSQL 18.6, 41 tabelas, uma migration baseline, zero falhas e ~13,5 MB
  de database size.
- Dados agregados semelhantes ao primeiro: 2 empresas, 3 usuários, 7
  clientes, 1 lead, 1 negócio, 21 mensagens, 4 produtos, acompanhamentos e
  movimentações; nenhuma proposta.
- Últimos timestamps de dados chegam a 28/07/2026; `pg_stat_activity` ficou
  sem conexões após a inspeção.

**Classificação: `UNKNOWN_PRESERVE`.** Parece um clone histórico/teste, mas a
finalidade e a necessidade dos dados não foram comprovadas.

## Consumidores e colisões de nomes

- API/worker oficiais apontam exclusivamente para `Postgres-u_yI`.
- `ga3-bundle-api` no environment `ga3-bundle-staging` aponta para
  `Postgres--e25`, que é `IN_USE` e não é candidato.
- O projeto separado `crm-postgres-test` possui um serviço chamado `Postgres`.
  O nome/host privado é semelhante, mas projeto, service ID e endpoint público
  são distintos; isso prova que nome/host isolado não identifica um banco.
- O repo atual não contém referências aos IDs candidatos fora dos próprios
  probes/relatórios e não há `.github/workflows`. Isso não prova ausência de
  jobs externos não acessíveis.
- Vercel foi verificado por projetos/deployments; a produção continua no
  runtime `eb1cadb`. Valores de env Vercel não foram lidos para não expor
  segredos, portanto esse gate permanece limitado a metadados.

## Falha do probe e correção

A primeira tentativa de inspeção do banco oficial usou a `DATABASE_PUBLIC_URL`
do serviço Postgres e falhou com `28P01` por credencial stale. O probe foi
corrigido para combinar o endpoint público do alvo com a credencial efetiva da
API em memória; a inspeção oficial então passou com 17 migrations e zero
falhas. Nenhum segredo foi impresso ou persistido.

## Decisão de limpeza

Os gates necessários para `ORPHAN_CONFIRMED` não estão satisfeitos:

```text
NO_UNIQUE_REQUIRED_DATA=false/unknown
NO_INTERMITTENT_CONSUMER_FOUND=unknown
OWNER_OR_PURPOSE_RESOLVED_AS_UNUSED=false
```

Logo, não houve backup adicional, stop ou delete. Criar cópia de dados reais
sem classificação de finalidade aumentaria risco sem benefício. O Postgres
oficial e todos os serviços de produção permaneceram intactos.

## Próxima ação segura

Mapear o `peerServiceId`/proprietário do tráfego do `Postgres` e confirmar com
metadados Railway se os volumes são snapshots descartáveis. Se qualquer gate
continuar desconhecido, manter `UNKNOWN_PRESERVE`; só então considerar backup,
restore drill e suspensão individual.
