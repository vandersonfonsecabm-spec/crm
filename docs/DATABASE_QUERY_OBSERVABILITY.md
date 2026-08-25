# Observabilidade de queries Prisma/PostgreSQL

Esta camada é opt-in e permanece desligada no runtime atual. Ela não altera
schema, migrations, dados ou flags de produto.

## Ativação controlada

Defina somente em um ambiente de teste/canário autorizado:

```cmd
set CRM_PRISMA_QUERY_OBSERVABILITY=true
set CRM_PRISMA_SLOW_QUERY_MS=500
set CRM_PRISMA_QUERY_METRICS_MAX=500
set CRM_PRISMA_QUERY_METRICS_TTL_MS=3600000
```

O cliente Prisma passa a escutar eventos `query` e `error`. O log é JSON
sanitizado e contém apenas evento, duração limitada, alvo, fingerprint opaco e
código seguro (`P2024`, `P2028`, `P2034`, etc.). Query SQL, parâmetros, URL,
tenant identificável, credenciais e mensagem bruta nunca são registrados.

Os fingerprints são mantidos em memória, com limite e TTL. A camada expõe
`__crmQueryObservability.snapshot()` apenas para diagnóstico controlado e
`observe(operation, fn)` para medir transações/operações que precisem de uma
fronteira explícita. Falha de logging nunca quebra a requisição ou o worker.

## pg_stat_statements

O script `backend/scripts/pg-stat-statements.cjs` é read-only:

```cmd
cd backend
node scripts/pg-stat-statements.cjs --sql
```

Ele imprime apenas as consultas de leitura para verificar a extensão e listar
os top `queryid` por tempo total/médio; não executa `CREATE EXTENSION`, reset ou
qualquer alteração. O check contra um banco descartável exige URL explícita e
`CRM_PG_STATS_CONFIRM=read-only`:

```cmd
set CRM_PG_STATS_DATABASE_URL=postgresql://usuario:senha@127.0.0.1:55432/crm_test
set CRM_PG_STATS_CONFIRM=read-only
npm run db:pg:stats:readonly
```

URLs oficiais/produção são rejeitadas. Sem cluster descartável real, o estado
correto é `BLOCKED_ENVIRONMENT`, nunca `PASS`.

## Critérios para fechar o gate

- habilitar somente em canário controlado, mantendo IA, Meta e outbound OFF;
- executar o check `pg_stat_statements` contra PostgreSQL descartável;
- coletar p95/p99 de query/operação e top fingerprints sem PII;
- alertar query p95 > 500 ms, p99 > 1 s, transação timeout/P2028/P2034 e
  checkpoint PostgreSQL > 60 s;
- manter o outlier histórico de 202,98 s como monitorado até haver recorrência
  ou correlação causal.
