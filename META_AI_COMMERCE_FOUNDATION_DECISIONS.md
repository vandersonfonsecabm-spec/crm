# E6A foundation decisions

CURRENT_STATE_AS_OF=2026-08-24 BRT
POST_STOCK_RUNTIME_BASE_SHA=a1232a195795912d0a900d51edfcc5f12d4b8955
AI_COMMERCE_SOURCE_COMMIT=2b8209ef25ba28a40b756948edfcc12c07f12970
AI_COMMERCE_RUNTIME_SHA=80a4f8d5c5067934e818f8e75f2f696d716e5ce0
DECISION_STATUS=FROZEN_FOR_VERTICAL_SLICE

PRODUCT_STATE=AI_COMMERCE_FOUNDATION_PRODUCTION_OFF_READY
REAL_PROVIDER=NOT_CONNECTED
REAL_CONNECTOR=NOT_IMPLEMENTED
AUTO_REPLY=NOT_IMPLEMENTED

CATALOG_AUTHORITY
- New AI path uses a tenant-scoped commercial overlay linked by composite FK to `ProdutoEstoque`.
- Legacy `ProdutoExterno`, `EstoqueExterno`, `PrecoExterno` and WhatsApp simulation are not AI sources of truth.
- Only PUBLISHED catalog products with a valid canonical stock link can produce a sellable offer.
- Manual/unlinked catalog products remain HIDDEN or NEEDS_CONFIRMATION.

PRICE_POLICY
- Price is a versioned catalog fact with explicit currency, observedAt and revision.
- Missing/stale price is `DO_NOT_QUOTE`; no price is inferred from legacy models.

AVAILABILITY_POLICY
- Canonical source authority, lot validity, freshness, confidence, unit semantics and available semantics are required.
- Explicit authoritative zero may be `OUT_OF_STOCK`.
- STALE, UNKNOWN, conflicting authority, incompatible unit, expired-only or incomplete data becomes `NEEDS_CONFIRMATION`.
- LOW_AVAILABILITY threshold is tenant-configured and unit-aware; no hardcoded global threshold.

OFFER_POLICY
- ProductOffer is an opaque, tenant/conversation-scoped immutable snapshot with TTL, catalog revision, price revision and stock material version.
- Every read and side effect revalidates tenant, conversation, TTL and material revisions.
- Internal IDs and exact quantities are never customer-visible by default.

OPPORTUNITY_POLICY
- `registerProductInterest` is append-only and does not overwrite `Cliente.interesse`.
- `createOpportunityDraft` is a draft-only entity/contract and does not create a normal visible `Negocio` until human promotion through the existing CRM path.
- Handoff reuses existing Inbox assignment/lease/queue; no second queue or recipient selected by AI.

MODE_POLICY
- Effective mode is OFF unless global/env gate, tenant feature gate, allowlist, settings, channel capability and Mock/canary gate all pass.
- `enabled=false` OR `mode=OFF` means zero runs and zero effects.
- SHADOW is read-only/dry-run; SUGGESTION_ONLY displays only; HUMAN_APPROVAL has separate approvals for composer insertion, interest, draft opportunity and handoff.

TRIGGER_AND_IDEMPOTENCY
- Mock run starts after committed inbound message.
- Unique identity is tenant + conversation + message id/revision + policy revision + mode.
- New message, conversation switch, lease loss, handoff/close or expired offer invalidates stale suggestions.

KNOWLEDGE_BOUNDARY
- E6A answers only structured catalog/offer facts. Warranty, freight, lead time and unstructured product Q&A are deferred to a future knowledge-base mission.

RETENTION
- AI context and tool evidence use finite bounded retention; no indefinite `purge default OFF` policy is accepted.
