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
operacional restante é explícito: runner Prisma genérico bloqueado antes da
execução, live Mock canary sem sessão administrativa e QA visual autenticado
sem sessão. O backup lógico protegido, restore/rehearsal, migration aditiva,
deploy OFF e health pós-deploy foram concluídos com evidência.

No preflight oficial, o Railway confirmou o banco Postgres-u_yI online. O
plano Hobby bloqueia Backups/PITR gerenciados; a operação usou backup lógico
protegido e restore isolado, sem imprimir nem enviar dados reais. As migrations
E6A foram aplicadas de forma aditiva e o banco passou o gate tenant/FK. A
produção permanece AI OFF; isso é OFF-ready, não canário live concluído.
