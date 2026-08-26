# Preflight de release — Proposta ↔ Catálogo V1

```text
RELEASE_CANDIDATE_BRANCH=release/ga2-post-e6a
RELEASE_CANDIDATE_HEAD=47613ac4f6e3c433eebfbbb1eb20281293b41e2e
RUNTIME_TESTED_COMMIT=afe830d40972d765d33fd1692c2663f4157c554c
REHEARSAL_HARNESS_COMMIT=d5f4f47ea0bcb0ce5da9a9ece4203811907068e5
REMOTE_RELEASE_HEAD=ee051c7721cdce1eff7fa549207e99d8f7c651e6
WORKTREE_CLEAN=true
RUNTIME_DIFF_TESTED_TO_HEAD=EMPTY
POSTGRES_REAL_REHEARSAL=PASS_LOCAL_CANDIDATE
POSTGRES_TEST_IMAGE=postgres:18.4
POSTGRES_REAL_REHEARSAL_18_4=PASS
POSTGRES_ROLLBACK_18_4=PASS
FRONTEND_TESTS=197/197
FRONTEND_BUILD=PASS
FRONTEND_LINT=PASS
PUSH=NOT_RUN
PRODUCTION_BACKUP=NOT_RUN
PRODUCTION_MIGRATION=NOT_RUN
PRODUCTION_DEPLOY=NOT_RUN
```

## Hashes do candidato testado

```text
POSTGRES_MIGRATION_SHA256=ee6535644e267c6490c98ec580b958db56926054e4cf66bdb522d1bd2fc68f05
PRISMA_SCHEMA_SHA256=16450ebb56b8f61365be387166e5e93bd6e5c6c880e7ec975b17b617fbf7bde7
PROPOSAL_SERVICE_SHA256=86dd98a8069e0ad2b2bdcb8aa10b8812f6ac2d01574046aa633f0393e2460275
PROPOSAL_PDF_SHA256=11a26feb67fd56f9dc9f3fa81a7e138fe498c7a8808fb689a70eef0b1ed2a250
FRONTEND_CRM_API_SHA256=74926f85baa30b49c4ab3047c5c62e40b84040d6b2608e55f5721ed139e74ead
FRONTEND_PACKAGE_SHA256=b147068c251c0d401704c1b83c6507ca20ba3e2b81a50bcf65acb463ce87b658
BACKEND_PACKAGE_SHA256=7c5b350d8aecd8b9c0e0c3dc2904736fef69465b14fd8dcf9826be8daba5c677
SOURCE_MANIFEST_SHA256=b3ec354b392f238cf528abc4f96f5289ab5c5b6fa35062df9fac181e87613c5b
```

## Correções de segurança incorporadas ao plano

- Testes de escrita, cross-tenant, alteração de preço/estoque e concorrência
  ficam somente no PostgreSQL descartável/staging sintético; produção terá
  apenas smoke e introspecção read-only.
- Antes da migration oficial: `CRM_MAINTENANCE_READ_ONLY=true`, worker parado,
  mutações retornando `503`, nenhum runner concorrente e backup restaurável.
- O startup normal não pode ser usado como “canário antes da migration”, pois
  executa `prisma migrate deploy`. Deve existir um único dono da migration.
- O runner de rehearsal foi corrigido para montar imagens PostgreSQL 18+ em
  `/var/lib/postgresql`; a suíte e o rollback foram repetidos em `18.4`.
- Rollback distingue falha antes de novas escritas de recovery/forward-fix
  depois que o schema novo tiver dados; não existe `down migration` presumido.
- `skuSnapshot` e `stockMaterialVersion` são os únicos snapshots nullable,
  porque suas fontes canônicas também são nullable; divergência posterior
  bloqueia a transição.

## Gate ainda bloqueado

Este preflight é local. Não comprova provider, versão, migration history,
backup/restore ou saúde do PostgreSQL oficial. Sem esses gates e sem autorização
operacional específica, não executar push, alteração de variáveis, backup,
deploy ou migration de produção.
