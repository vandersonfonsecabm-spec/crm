# Segurança e confiabilidade — GA3

CURRENT_STATE_AS_OF=2026-08-25 BRT
START_SOURCE_SHA=25b36e639612275abc826f36f8f89a66fd06701a
CURRENT_SOURCE_SHA=d6b665ea8c1cb8eb6d4e80a3f3210aa2ee433950
FINAL_RUNTIME_SHA=d6b665ea8c1cb8eb6d4e80a3f3210aa2ee433950
DOCUMENT_STATUS=GA3_SECURITY_RELIABILITY_PASS_WITH_ADVISORY

## Proteções confirmadas

- Auth/RBAC/tenant gate preservados; `/auth/me` sem sessão retorna 401.
- Runs AI exigem conversa/mensagem inbound do tenant; contexto é reidratado do banco.
- IDs, customer, canal, responsável e revisões são conferidos tenant-scoped.
- `approvedActions` não atravessa run público; side effects só passam pela aprovação persistida/CAS.
- ProductOffer explícito exige revalidação de tenant, conversa, TTL e status ACTIVE.
- Tool schemas rejeitam required ausente e campos desconhecidos; output/input/audit redaction cobre credenciais e chaves.
- Efeitos interest/opportunity/handoff reconciliam P2002 e preservam idempotência.
- Disponibilidade externa não expõe IDs de estoque; unidades/fontes conflitantes retornam confirmação necessária.
- AI, Mock, canary, Meta e outbound permanecem OFF/zero.

## Regressão

- E6A combinado: 43/43 PASS no snapshot atual.
- Backend global isolado: exit 0 no runner sandbox autorizado; migrations/tenant gates passaram; PostgreSQL-only ficou separado.
- Frontend: 195/195 PASS, build TypeScript/Vite PASS, lint PASS; a mudança foi bootstrap sem redesign.
- API/worker Railway `SUCCESS` (`59c6142f`/`482ac3c0`), `/health`/`/ready` 200/database ok.

## Limitações explícitas

- Checkpoint IO histórico >200s requer observação, não foi tratado como vulnerabilidade comprovada.
- Sem cluster PostgreSQL descartável, locks/migrations PostgreSQL-only e pg_stat_statements ao vivo continuam BLOCKED_EXTERNAL.
- Rotas legadas administrativas/Bling permanecem ACTIVE_LEGACY/TEST_ONLY; não são usadas pelo caminho AI canônico.
