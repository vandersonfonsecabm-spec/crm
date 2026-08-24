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

Nenhum HIGH/CRITICAL aberto no source local após as correções. O risco
operacional restante é explícito: runner Prisma genérico bloqueado e ausência
de rehearsal/migration/deploy oficial. Isso impede declarar production ship,
mas não impede declarar a fundação source/rehearsal OFF-ready.

No preflight oficial, o Railway confirmou que o banco Postgres-u_yI está online
e ainda sem tabelas E6A, enquanto o plano Hobby bloqueia Backups/PITR. Esse é um
hard stop material para migration oficial: não houve push, merge, deploy ou
alteração de produção.
