# Execução do preflight de liberação — 2026-08-26

## Resultado

```text
LOCAL_RELEASE_PREFLIGHT=PASS
SOURCE_HASHES=MATCH
WORKTREE_CLEAN=true
RUNTIME_DIFF_TESTED_TO_HEAD=EMPTY
POSTGRES_REAL_REHEARSAL_18_4=PASS
POSTGRES_ROLLBACK_18_4=PASS
FRONTEND_TESTS=197/197
FRONTEND_BUILD=PASS
FRONTEND_LINT=PASS
PRODUCTION_HEALTH=PASS
PRODUCTION_READY=PASS
PRODUCTION_BACKUP=NOT_RUN
MAINTENANCE_FREEZE=NOT_RUN
PRODUCTION_MIGRATION=NOT_RUN
PRODUCTION_DEPLOY=NOT_RUN
```

## Evidência local

- Branch: `release/ga2-post-e6a`.
- HEAD verificado: `d2932111eeadf3e626d982d6167bc84b1777c257`.
- Runtime testado: `afe830d40972d765d33fd1692c2663f4157c554c`.
- O HEAD posterior contém apenas documentação/regras; nenhum arquivo de
  `backend/src`, `backend/prisma-postgres`, `backend/prisma` ou `frontend`
  diverge do runtime testado.
- Os hashes do preflight oficial conferem integralmente.
- O remoto ainda está em `ee051c7721cdce1eff7fa549207e99d8f7c651e6`; nenhum push
  foi executado.

## Produção read-only

```text
GET https://api-production-875f9.up.railway.app/health
{"status":"ok","service":"crm-agro-api"}

GET https://api-production-875f9.up.railway.app/ready
{"status":"ready","service":"crm-agro-api","database":"ok"}
```

Não foi possível identificar com segurança, a partir do ambiente atual, o
provider/versão/cluster/database/schema/usuário efetivos nem ler
`_prisma_migrations`: o worktree não está vinculado a um projeto Railway e não
há URL PostgreSQL oficial autorizada. Nenhum segredo foi solicitado ou exposto.

## Hard stop operacional

As etapas seguintes permanecem bloqueadas até existir um mecanismo autorizado
para confirmar o banco oficial e executar, nesta ordem:

1. provider/versão/history read-only;
2. janela e responsável de manutenção;
3. backup lógico e snapshot do provedor;
4. restore drill real em banco isolado;
5. `CRM_MAINTENANCE_READ_ONLY=true`, worker/outros writers parados e mutações
   respondendo `503`;
6. um único dono da migration;
7. validação pós-migration e smoke somente leitura.

Não foi executado push, alteração de variável, backup, deploy, migration,
restore ou escrita em produção.
