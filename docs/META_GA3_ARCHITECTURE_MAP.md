# Mapa real da arquitetura — GA3

CURRENT_STATE_AS_OF=2026-08-25 BRT
START_SOURCE_SHA=25b36e639612275abc826f36f8f89a66fd06701a
CURRENT_SOURCE_SHA=cf7e87f961b05996d4e806ab7bcfd657b2b111f0
FINAL_RUNTIME_SHA=cf7e87f961b05996d4e806ab7bcfd657b2b111f0
DOCUMENT_STATUS=GA3_RECONCILED_COMPONENT_MAP

## Componentes comprovados

- Frontend: React/Vite/TypeScript em `frontend`; produção Vercel projeto `crm`.
- API: Express/Prisma em `backend/src/server.js`, Railway service `api`.
- Worker: um processo multiplexado em `backend/src/automations/worker.js`, Railway service `crm`; automações H7, notificações H8 e estoque compartilham o ciclo.
- Banco oficial: PostgreSQL Railway `Postgres-u_yI`; SQLite é schema-fonte/fixture protegido para testes.
- AI Commerce: catálogo canônico, disponibilidade, busca, ProductOffer, conexão Mock/Unconfigured e Inbox; não há provider real, worker AI ou outbound.
- Meta: intake/processors WhatsApp, Instagram e Messenger com retry bounded/CAS/lease; flags e canais reais OFF.
- Legado ativo: `commercialCatalogService`/`ProdutoExterno` e Bling continuam montados em rotas administrativas/TEST_ONLY; não são usados pelo pipeline AI canônico e não foram removidos.

## Fluxo de request

`Vercel SPA → Railway API → headers/CORS/maintenance → auth/RBAC/tenant → rotas de domínio → serviços Prisma tenant-scoped → PostgreSQL`.

Webhooks Meta entram antes da autenticação de usuário, passam por verificação/intake, e só processam quando o gate do canal permite. O worker não envia mensagens externas.

## Fluxo AI endurecido

`Inbox sourceMessageId → resolver server-side de conversa/mensagem/cliente/canal → contexto sanitizado → registry fechado → revalidação ProductOffer/estoque → draft persistido → aprovação CAS → efeito idempotente`.

`approvedActions` não é aceito em run público; `runId` é server-owned; idempotência é tenant+conversa scoped; ofertas explícitas são reidratadas pelo serviço canônico.

## Limites arquiteturais

- `AI_COMMERCE_ENABLED=false`, Mock=false, canary=false, allowlist deny-all.
- `CRM_PRISMA_QUERY_OBSERVABILITY=false` após janela controlada de profiling.
- Nenhuma migration/schema/dado oficial foi alterado pela GA3.
- Runner PostgreSQL real e leitura efetiva de `pg_stat_statements` dependem de cluster descartável/Docker e permanecem gates externos.
