# Commercial Proposal ↔ Catalog Contract V1

Status: `COMMERCIAL_PROPOSAL_CATALOG_CONTRACT_V1_STATUS=APPROVED`

Approved scope: catalog-linked proposal items, immutable snapshots, tenant-scoped
relations and material-transition revalidation.
Explicitly out of scope: discount policy, orders, reservation, payment, ERP,
AI discount authority, Meta and outbound.

## Frozen authority block

```text
COMMERCIAL_PROPOSAL_CATALOG_CONTRACT_V1_STATUS=APPROVED
AUTHORITATIVE_PRICE_SOURCE=CommercialCatalogProduct.commercialPrice
AUTHORITATIVE_CURRENCY_SOURCE=CommercialCatalogProduct.currency
AUTHORITATIVE_PRICE_STATUS_SOURCE=CommercialCatalogProduct.priceStatus
AUTHORITATIVE_SKU_SOURCE=ProdutoEstoque.skuCanonico
AUTHORITATIVE_UNIT_SOURCE=ProdutoEstoque.unidadeCanonica
MONETARY_ROUNDING=ROUND_HALF_UP
CURRENCY_V1=BRL
ITEM_TYPES=CATALOG_ITEM,LEGACY_ITEM
ITEM_TYPE_ENFORCEMENT=ENUM_OR_DATABASE_CHECK
TENANT_COMPOSITE_FK_REQUIRED=true
PRODUCT_OFFER_EXPIRY_SOURCE=ProductOffer.expiresAt
PRODUCT_OFFER_PURGE=DISABLED
ON_DELETE_PRODUCT_OFFER=RESTRICT
PROPOSAL_HISTORICAL_AUTHORITY=ITEM_SNAPSHOT
PRODUCT_OFFER_ROLE=ORIGIN_EVIDENCE
AUDIT_REVALIDATION_SCOPE=MATERIAL_TRANSITIONS_ONLY
DISCOUNT_POLICY_STATUS=DEFERRED
AI_DISCOUNT_AUTHORITY=NOT_IMPLEMENTED
AUTOMATIC_DISCOUNT=DISABLED
CATALOG_OPTIONAL_SNAPSHOT_FIELDS=skuSnapshot,stockMaterialVersion
```

## Source-of-truth chain

```text
CommercialCatalogProduct.commercialPrice/currency/priceStatus
        ↓
ProductOffer.price/currency + expiresAt/catalogRevision/stockMaterialVersion
        ↓
ItemPropostaComercial catalog snapshot
        ↓
proposal API and historical PDF
```

The frontend never supplies authoritative price, currency, SKU, unit, catalog
revision or stock version for a catalog item. The server resolves and snapshots
those values.

`ProductOffer.expiresAt` is the commercial validity of the offer.
`PropostaComercial.validade` is the validity of the proposal. They are
independent. An expired or `STALE` offer is not deleted in V1, but it cannot
authorize a material proposal transition. Historical PDFs use the item snapshot,
never the current catalog row.

## Item invariants

### `CATALOG_ITEM`

- has the proposal tenant;
- has a tenant-scoped ProductOffer;
- has a tenant-scoped CommercialCatalogProduct;
- has a tenant-scoped ProdutoEstoque;
- stores product, SKU, unit, quantity, price, currency, price status, offer
  expiry, catalog revision and stock material version snapshots;
- participates in material-transition revalidation;
- rejects client-supplied authoritative pricing.

### `LEGACY_ITEM`

- remains compatible with existing proposals;
- has no artificial catalog/ProductOffer link;
- keeps its historical description and price;
- does not participate in catalog revalidation;
- remains renderable in existing PDFs and history.

Mixed proposals are explicitly allowed. Existing items are deterministically
classified as `LEGACY_ITEM`; no automatic product matching or catalog backfill is
performed.

## Tenant-scoped database relations

`ItemPropostaComercial` receives `empresaId` and the migration must enforce:

```text
(empresaId, propostaId) → PropostaComercial
(empresaId, productOfferId) → ProductOffer
(empresaId, catalogProductId) → CommercialCatalogProduct
(empresaId, stockProductId) → ProdutoEstoque
```

The referenced models must expose compatible unique keys before foreign keys are
created. Existing item tenants are populated deterministically from their parent
proposal, then checked for orphaned or cross-tenant rows before the column is
made mandatory.

The database must reject invalid `CATALOG_ITEM`/`LEGACY_ITEM` combinations with
an enum or equivalent `CHECK`; service validation remains defense in depth.
`ProductOffer` is never cascade-deleted into proposal items.

The canonical SKU and stock material version are nullable at the source model,
so V1 permits only these two snapshot fields to be null. A null value is not an
authority bypass: if the canonical source later supplies a value or a version,
material-transition revalidation reports the mismatch and blocks advancement.
All other catalog snapshots required by the catalog-item CHECK remain present.

## Revalidation

Only `CATALOG_ITEM` is revalidated, and only during a material transition:

```text
RASCUNHO → PRONTA
PRONTA → ENVIADA
ENVIADA → ACEITA
```

The central revalidator compares, directly and without silent replacement:

- ProductOffer status and `expiresAt`;
- catalog publication/archive state;
- catalog price and `priceStatus`;
- currency (`BRL` in V1);
- catalog revision;
- stock material version;
- sellable availability and freshness;
- canonical SKU/unit where applicable;
- requested quantity.

Any material divergence blocks the transition with
`PROPOSAL_REVALIDATION_REQUIRED` and a bounded reason such as
`OFFER_EXPIRED`, `PRICE_CHANGED`, `CATALOG_REVISION_CHANGED`,
`STOCK_MATERIAL_CHANGED`, `OUT_OF_STOCK`, `STALE_AVAILABILITY`,
`UNKNOWN_AVAILABILITY`, `PRODUCT_UNAVAILABLE`, `UNIT_MISMATCH`,
`CURRENCY_MISMATCH` or `PRICE_UNAVAILABLE`.

Revalidation is not emitted merely because a proposal was viewed or polled.
Audit records are limited to material transition attempts.

## Monetary rules

Catalog Decimal prices are converted to integer cents with deterministic
`ROUND_HALF_UP`, without passing through binary floating point. `AVAILABLE` is
the only status that supplies an automatically usable price. `ON_REQUEST`,
`UNAVAILABLE` and `STALE` cannot produce an automatically acceptable price.

## Existing audit system

The existing `HistoricoPropostaComercial` remains the audit store. V1 may add
only the necessary additive actions:

```text
ADICIONAR_ITEM_CATALOGADO
REVALIDAR
REVALIDACAO_RECUSADA
```

Material changes continue to use the existing `ATUALIZAR` and
`DUPLICAR_VERSAO` semantics; no duplicate audit subsystem is introduced.

## Explicit exclusions

```text
DISCOUNT_POLICY_STATUS=DEFERRED
AI_DISCOUNT_AUTHORITY=NOT_IMPLEMENTED
AUTOMATIC_DISCOUNT=DISABLED
POSTGRES_REAL_REHEARSAL=PASS_LOCAL_CANDIDATE
PRODUCTION_MIGRATION=NOT_RUN
META_REAL_CHANNELS=OFF
AI_REAL_CONNECTOR=OFF
OUTBOUND=0
```

Approval of this document authorizes implementation of the additive catalog
item/snapshot/revalidation contract only. It does not authorize discount rules,
orders, payments, external channels or irreversible production data changes.
