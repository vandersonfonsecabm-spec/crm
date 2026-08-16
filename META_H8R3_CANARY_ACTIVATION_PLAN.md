# H8R3 — Plano do delta causal mínimo

## Finding aprovado para investigação

`SOL_CANARY_ACTIVATION_REVIEW=FIX_FIRST` encontrou dois riscos materiais no mecanismo existente:

1. Com `H8_NOTIFICATIONS_ENABLED=true`, qualquer gestor autenticado de qualquer empresa poderia abrir `/notificacao-configuracao` e fazer upsert de `habilitada=true` no próprio tenant. A configuração era tenant-scoped, mas não era allowlisted para o canário.
2. `updateSettings` fazia somente o upsert; não havia ator, correlação nem fotografia explícita `habilitada anterior -> nova` em `AuditoriaSeguranca`.

Os flags globais e o filtro por `ConfiguracaoNotificacaoEmpresa` permanecem o mecanismo existente. O problema é a exposição operacional durante o período de canário, não o motor de projeção.

## Menor delta proposto

- Adicionar em `backend/src/notifications/service.js` o parser fail-closed de `H8_NOTIFICATION_TENANT_ALLOWLIST` (lista delimitada de IDs positivos).
- Aplicar essa allowlist em `assertEnabled`, `getSettings`, `updateSettings`, `projectForTenant` e `processDue`. Allowlist ausente/vazia/inválida significa nenhum tenant elegível.
- Fazer `updateSettings` em transação; validar/ler o ator no mesmo tenant, ler o estado anterior, upsertar a configuração e criar uma linha `AuditoriaSeguranca` com `empresaId`, `actorUsuarioId`, `correlationId` gerado pelo servidor com CSPRNG (`crypto.randomUUID()`), ação H8 e motivo sanitizado contendo `habilitada anterior -> nova`. Falha da auditoria deve reverter o upsert.
- Adicionar testes focais de allowlist, cross-tenant fail-closed, worker elegível somente para allowlist e auditoria de habilitação/reversão.

## Escopo

| Área | Alteração |
|---|---|
| source | SIM, somente `backend/src/notifications/service.js` e teste focal |
| schema/migration | NÃO; `AuditoriaSeguranca` já existe |
| env | SIM, nova variável explícita, default efetivo vazio/OFF |
| frontend | NÃO |
| worker | SIM, somente leitura da allowlist no mesmo serviço H8; `AUTOMATION_WORKER_ENABLED` intocado |
| H7 | NÃO |
| outbound | NÃO |
| tipos H8 | NÃO |

## Rollback

- Antes do canário: não definir a allowlist e manter os dois flags H8 desligados.
- Durante a operação normal: manter API global + allowlist QA, fazer PATCH autenticado de `habilitada=false`, confirmar auditoria e contagem `habilitada=true=0`; em seguida desligar `NOTIFICATIONS_WORKER_ENABLED` e aguardar o ciclo/restart; remover/zerar a allowlist; por último desligar `H8_NOTIFICATIONS_ENABLED` na API/worker.
- Emergency path: se a API não estiver disponível, registrar a falha e usar somente procedimento de banco controlado/autorizado para colocar a linha QA como `false` antes de remover os gates; não declarar rollback concluído deixando a linha habilitada.
- Não exige down migration, não remove histórico e não afeta `AUTOMATION_WORKER_ENABLED`.

## Testes causais

- allowlist vazia/inválida não habilita tenant;
- tenant QA allowlisted pode ler/alterar a própria configuração;
- gestor de tenant fora da allowlist recebe 404 e não cria/altera configuração;
- `processDue` consulta/processa somente IDs allowlisted;
- habilitar e desabilitar grava auditoria com ator e transição;
- H7 e outbound permanecem inalterados;
- `node --check`, teste H8 focal, tenant gate, build/diff/secret scan.

## Gate

Este plano requer `SOL_H8R3_PRE_DELTA=APPROVED` antes de qualquer edição de source ou alteração operacional.
