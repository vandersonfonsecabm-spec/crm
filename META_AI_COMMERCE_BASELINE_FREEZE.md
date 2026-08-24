# Baseline pós-estoque congelada

CURRENT_STATE_AS_OF=2026-08-24 BRT
POST_STOCK_RUNTIME_BASE_SHA=a1232a195795912d0a900d51edfcc5f12d4b8955
POST_STOCK_CANONICAL_REF=stock-mvp-production-ship-2026-08-24
POST_STOCK_DOCS_SHA=23485b5
POST_STOCK_RECONCILIATION_SHA=812413ffd18139b08e66d01ec99e7883ec4da63f
AI_COMMERCE_CORE_SOURCE_COMMIT=2b8209ef25ba28a40b756948edfcc12c07f12970
AI_COMMERCE_SOURCE_COMMIT=a45eba71aede67546cf1459b0955e80e6586bff9
AI_COMMERCE_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9

`a1232a1` foi comprovado como o tree de runtime. `5127d53` e `812413f` são
documentação/reconciliação e não foram usados como base de código. A tag
anotada local foi criada sem mover ou forçar referência existente.

O baseline preserva PostgreSQL oficial, 14 migrations do estoque, flags OFF,
tenant stock allowlisted, H8 existente, Bling TEST_ONLY e zero outbound. A E6A
adiciona somente migrations aditivas posteriores:

- `20260824150000_add_ai_commerce_catalog_foundation`
- `20260824160000_add_ai_commerce_persistent_audit_effects`

As migrations oficiais foram aplicadas somente depois de backup lógico
protegido, restore/rehearsal isolado e gate de integridade. API, worker e
frontend foram publicados com a fundação AI OFF no merge SHA
`a45eba71aede67546cf1459b0955e80e6586bff9`. O canário live Mock e a prova
visual autenticada foram concluídos com PASS; o estado final permanece OFF,
sem modelo real, auto-reply ou outbound.
