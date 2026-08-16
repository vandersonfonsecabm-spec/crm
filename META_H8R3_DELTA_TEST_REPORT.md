# H8R3 — Testes do delta causal

## Escopo

Delta limitado a `backend/src/notifications/service.js` e `backend/tests/notifications-h8.test.js`:

- allowlist fail-closed `H8_NOTIFICATION_TENANT_ALLOWLIST`;
- filtro do worker para IDs allowlisted;
- auditoria atômica de settings com ator, correlação CSPRNG e transição booleana.

Não houve schema, migration, frontend, H7 ou outbound.

## Execução

Comando: `node scripts/run-isolated-prisma-tests.cjs node-test tests/notifications-h8.test.js`

Resultado: **9/9 PASS** em sandbox temporário Prisma/SQLite.

Casos novos aprovados:

1. gestor fora da allowlist recebe `NOTIFICATIONS_DISABLED`/404 e não habilita configuração;
2. tenant allowlisted pode habilitar/desabilitar e cada transição grava `AuditoriaSeguranca` com ator, correlationId e `habilitada=old->new`;
3. worker com `NOTIFICATIONS_WORKER_ENABLED=true` materializa somente o tenant presente na allowlist.

Regressões H8 no mesmo arquivo: projeção idempotente, read vs resolve, cutoff read-all, target removido, preferências e reconciliação; todas PASS.

Checks adicionais:

- `node --check backend/src/notifications/service.js`: PASS;
- `node --check backend/tests/notifications-h8.test.js`: PASS;
- tenant-isolation gate do runner: 91/91 relações, zero órfãos/cross-tenant;
- `backend/prisma/dev.db`: SHA preservado.
