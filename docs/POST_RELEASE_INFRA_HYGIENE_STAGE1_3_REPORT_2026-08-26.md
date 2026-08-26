# POST_RELEASE_INFRA_HYGIENE — etapas 1 e 3

Data: 2026-08-26
Escopo: mapeamento read-only dos bancos extras e observação controlada da
produção. Nenhuma variável, deployment, serviço, volume ou dado foi alterado.

## Resultado

```text
STAGE_1_EXTRA_POSTGRES_MAPPING=PASS_WITH_UNMAPPED_ADVISORY
STAGE_3_PRODUCTION_OBSERVATION=PASS_SHORT_WINDOW
PRODUCTION_WRITES=0
PRODUCTION_CONFIG_CHANGES=0
PRODUCTION_DEPLOYS=0
PRODUCTION_RESTARTS=0
PRODUCTION_MIGRATIONS=0
API_HEALTH=200
API_READY=200_DATABASE_OK
API_HTTP_5XX_LOOKBACK=0
API_ERROR_LOG_LOOKBACK=0
WORKER_ERROR_LOG_LOOKBACK=0
```

## Etapa 1 — bancos extras

Projeto Railway `glistening-playfulness`, ambiente `production`:

| Serviço | ID | Deployment | Estado | Volume usado | Classificação |
| --- | --- | --- | --- | --- | --- |
| `Postgres-u_yI` | `e9d8a6b8-507b-45fb-92a8-3ab016f865a2` | `2c50c362-33ca-40f4-837a-76559440ecbb` | SUCCESS/online | ~494 MB | oficial; não tocar |
| `Postgres` | `d22addf0-538b-4532-a288-b98a0a66ecae` | `f8c0fb9c-9afb-4dae-b146-43dadb0ccfdf` | SUCCESS/online | ~298 MB | `UNMAPPED_ACTIVE_DATABASE` |
| `Postgres-MpW9` | `c10e8f8d-8eaf-4ec8-8344-a485823051e9` | `ffe0f620-061a-4b14-9846-ded16b17a09d` | SUCCESS/online | ~162 MB | `UNMAPPED_ACTIVE_DATABASE` |

API (`16de1b91-7dcb-46b4-9231-1c3e2c3e5a92`) e worker
(`4eef3b96-e33f-42ea-9fb8-86c17b077ab8`) estão online e referenciam somente
`postgres-uyi.railway.internal` nas variáveis de conexão redigidas. Nenhum URL
de `postgres.railway.internal` ou `postgres-mpw9.railway.internal` apareceu nas
conexões da API/worker.

Os extras possuem endpoints e volumes próprios e não podem ser chamados de
órfãos apenas por esse resultado. Logs disponíveis mostram checkpoints/recovery
normais de PostgreSQL em 23–24/08; não há evidência de consumidor da aplicação.

**Ação tomada:** nenhuma exclusão, parada ou alteração. Próximo passo seguro é
mapear proprietário/finalidade e referências em outros projetos/serviços antes
de qualquer decisão de custo ou limpeza.

## Etapa 3 — observação de produção

Foi consultado um lookback de 30 minutos e uma amostra atual:

- Railway API e worker: `SUCCESS`, online, réplica única, sem eventos de erro
  nos logs consultados;
- HTTP API: nenhum registro `500..599` no lookback;
- `/health`: `{"status":"ok","service":"crm-agro-api"}`;
- `/ready`: `{"status":"ready","service":"crm-agro-api","database":"ok"}`;
- Vercel canônico: HTTP `200`;
- worker permaneceu ativo; não foi reiniciado.

Esta é uma observação curta/lookback, não uma garantia de 24 horas. Não foram
executados testes de escrita, login durante maintenance, alteração de catálogo,
cross-tenant ou PDF em produção.

## Credential drift

O wrapper redigido confirmou que API e banco oficial usam o mesmo endpoint,
database e usuário, mas a senha armazenada no serviço Postgres não coincide com
a credencial efetiva selecionada pela API (`credentialMatch=false`). Isso pode
ser variável stale ou rotação válida. Não houve sincronização/rotação, pois a
fonte autoritativa e o blast radius ainda não estão comprovados.

## Conclusão

As etapas 1 e 3 foram executadas com segurança. Não existe falha bloqueante
observada no runtime. Permanecem dois advisories: bancos extras ativos sem
proprietário mapeado e drift de credencial a tratar em janela dedicada.
