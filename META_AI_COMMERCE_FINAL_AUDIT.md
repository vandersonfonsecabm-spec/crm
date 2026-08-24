# Auditoria final E6A

## Escopo revisado

Catálogo comercial canônico, availability, ProductOffer, registry de tools,
connection port, Mock, orchestrator, audit, efeitos HITL, Inbox e settings/UI.

## Achados corrigidos

- relações AI child/run divergentes entre schema e migrations;
- FK de `AICommerceHandoff.opportunityDraftId` ausente em uma variante;
- hash de migration desatualizado no gate;
- `audit.normalizeModelData` com chave `id` duplicada;
- settings usando `value` inexistente em vez de `body`;
- efeitos usando `opportunityDraftId` dentro de FK de draft normal;
- efeitos sem rechecagem de customer/draft/opportunity tenant-scoped;
- output de oferta contendo IDs internos;
- tool policy permitindo todos os reads quando allowlist vazia.

## Resultado

Nenhum HIGH/CRITICAL aberto no source local após as correções. O runner Prisma
genérico permanece bloqueado antes da execução, mas a migration oficial passou
por mecanismo PostgreSQL operacional equivalente. O live Mock canary passou
com SHADOW/SUGGESTION/HUMAN_APPROVAL, tenant isolation, idempotência e zero
outbound. A única pendência é QA visual autenticado sem sessão.

No preflight oficial, o Railway confirmou o banco Postgres-u_yI online. O
plano Hobby bloqueia Backups/PITR gerenciados; a operação usou backup lógico
protegido e restore isolado, sem imprimir nem enviar dados reais. As migrations
E6A foram aplicadas de forma aditiva e o banco passou o gate tenant/FK. A
produção permanece AI OFF após cleanup; isso é foundation OFF-ready, não um
vendedor autônomo com IA real.
