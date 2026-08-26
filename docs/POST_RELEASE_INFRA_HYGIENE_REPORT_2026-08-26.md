# POST_RELEASE_INFRA_HYGIENE — relatório sanitizado

Data: 2026-08-26
Escopo: inventário read-only do Railway production e verificação redigida de
dependências/credenciais. Nenhum serviço, volume, variável, deploy ou dado foi
alterado.

## Resultado

```text
POST_RELEASE_INFRA_HYGIENE=PASS_WITH_ADVISORIES
OFFICIAL_RAILWAY_TARGET=VERIFIED
OFFICIAL_POSTGRES=Postgres-u_yI
API_DATABASE_TARGET=OFFICIAL_POSTGRES
WORKER_DATABASE_TARGET=OFFICIAL_POSTGRES
EXTRA_POSTGRES_DEPENDENCIES=NOT_FOUND_IN_SERVICE_URLS
EXTRA_POSTGRES_OWNERSHIP=UNMAPPED
CREDENTIAL_ENDPOINT_MATCH=true
CREDENTIAL_MATCH=false
PRODUCTION_DB_CLEANUP=DEFERRED_TARGET_UNCERTAIN
PRODUCTION_CREDENTIAL_ROTATION=DEFERRED_DEDICATED_WINDOW
RUNTIME_CHANGES=0
```

## Alvos confirmados

Projeto Railway `glistening-playfulness`, environment `production`:

| Serviço | Identidade observada | Estado | Volume aproximado | Uso comprovado |
| --- | --- | --- | --- | --- |
| `api` | serviço oficial da API | online | 79,7 MB | aponta para `postgres-uyi.railway.internal` |
| `crm` | worker oficial | online | sem volume | aponta para `postgres-uyi.railway.internal` |
| `Postgres-u_yI` | banco oficial | online | 494,1 MB | destino da API/worker |
| `Postgres` | banco adicional | online | 298,3 MB | sem consumidor em URL de serviço auditada |
| `Postgres-MpW9` | banco adicional | online | 162,3 MB | sem consumidor em URL de serviço auditada |

Os IDs/deployments completos permanecem nos registros operacionais do Railway;
este relatório não contém credenciais ou URLs completas.

## Dependências

O helper `backend/scripts/railway-infra-hygiene-redacted.cjs` foi corrigido
antes da classificação: referências são calculadas somente em
`DATABASE_URL`, `DATABASE_PUBLIC_URL` e `POSTGRES_DATABASE_URL`; valores de
variáveis nunca são impressos. Após a correção:

- API e worker referenciam somente `postgres-uyi.railway.internal`;
- `Postgres` referencia somente `postgres.railway.internal`;
- `Postgres-MpW9` referencia somente `postgres-mpw9.railway.internal`;
- não apareceu URL de nenhum extra nas variáveis de conexão da API/worker.

Os logs disponíveis dos extras mostram checkpoints/recovery normais de
PostgreSQL em 23–24/08. A classificação `@level:error` do Railway também
rotula algumas linhas normais `LOG` como error; isso não foi tratado como falha
da aplicação. Não há prova suficiente para chamar os extras de órfãos.

## Credential drift

A checagem redigida confirmou:

```text
api endpoint       = postgres-uyi.railway.internal:5432/railway
official endpoint  = postgres-uyi.railway.internal:5432/railway
endpointMatch      = true
credentialMatch    = false
```

Nenhum segredo foi exibido, persistido ou anexado. O drift pode ser uma variável
stale no serviço Postgres ou uma rotação válida usada pela API. Não sincronizar
nem rotacionar automaticamente: primeiro inventariar a variável autoritativa,
definir janela/RPO-RTO e validar API/worker após a troca.

## Ações executadas

- `railway status` e inventário de serviços: PASS.
- helper redigido: `node --check` e execução: PASS.
- health/ready da API: PASS (`200`, banco OK).
- logs de erro recentes da API/worker: nenhum evento.
- nenhum delete, stop, alteração de variável, restart, deploy ou migration.
- nenhuma limpeza dos dois Postgres adicionais.

## Próximo lote seguro

1. Mapear dependências via configuração/deploys e confirmar proprietário de cada
   banco extra, sem consultar ou copiar segredos.
2. Se o drift for confirmado, planejar rotação coordenada em janela dedicada;
   nunca alterar `DATABASE_URL` por argumento de shell ou sem rollback.
3. Só após prova de ausência de consumidores e autorização específica, avaliar
   parar/remover um serviço extra individualmente.

Relatórios relacionados:

- `docs/COMMERCIAL_PROPOSAL_CATALOG_V1_POST_RELEASE_AUDIT_2026-08-26.md`
- `docs/COMMERCIAL_PROPOSAL_CATALOG_V1_PRODUCTION_RELEASE_REPORT_2026-08-26.md`
