# Code health, arquitetura e código morto — GA3

CURRENT_STATE_AS_OF=2026-08-25 BRT
START_SOURCE_SHA=25b36e639612275abc826f36f8f89a66fd06701a
CURRENT_SOURCE_SHA=d6b665ea8c1cb8eb6d4e80a3f3210aa2ee433950
FINAL_RUNTIME_SHA=d6b665ea8c1cb8eb6d4e80a3f3210aa2ee433950
DOCUMENT_STATUS=GA3_CODE_HEALTH_REVIEWED

## Classificação

- `backend/src/ai-commerce/mock.js`: PROVEN_DEAD no backend; a rota de mock constrói a conexão diretamente. Não foi apagado automaticamente para não quebrar contrato externo não observável.
- Root Nest (`src/`, `prisma/`): PROVEN_LEGACY/GUARDED; scripts de runtime bloqueiam seu uso. Não remover.
- `commercialCatalogService.js`, ProdutoExterno e Bling: ACTIVE_LEGACY/TEST_ONLY; ainda têm import/rota/teste. Não remover.
- AI event/outbox dedicado: NOT_IMPLEMENTED/UNKNOWN; `eventJson` de auditoria não foi confundido com barramento.

## Correções de qualidade

- Tool registry: schemas strict, campos required/unknown, filtros bounded.
- Audit: caps de bytes e redaction recursiva; sem payload ilimitado.
- Effects: helper de reconciliação de unique conflict.
- Availability: precisão fixed-scale, autoridade/fonte/unidade explícitas.
- Search: projeção mínima e disponibilidade opt-in.
- ProductOffer: reuse/in-flight/cap.
- Frontend: sessão validada é reutilizada no bootstrap.

## Não feito por falta de causa

Não houve reescrita de arquivos grandes, abstração genérica, virtualização, useMemo espalhado, remoção de legado ou criação de microserviço: tamanho/estética sem impacto medido não é finding.
