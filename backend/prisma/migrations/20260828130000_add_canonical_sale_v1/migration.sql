-- Canonical Sale V1 is additive. Legacy Cliente.valor and Negocio.valor are
-- intentionally preserved without conversion or backfill.

ALTER TABLE "PropostaComercial" ADD COLUMN "moeda" TEXT NOT NULL DEFAULT 'BRL';

CREATE UNIQUE INDEX "PropostaComercial_empresaId_negocioId_id_key"
  ON "PropostaComercial"("empresaId", "negocioId", "id");

CREATE UNIQUE INDEX "Negocio_empresaId_clienteId_id_key"
  ON "Negocio"("empresaId", "clienteId", "id");

CREATE UNIQUE INDEX "ItemPropostaComercial_empresaId_propostaId_id_key"
  ON "ItemPropostaComercial"("empresaId", "propostaId", "id");

CREATE TABLE "VendaCanonica" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "empresaId" INTEGER NOT NULL,
  "negocioId" INTEGER NOT NULL,
  "clienteId" INTEGER NOT NULL,
  "origem" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "propostaVencedoraId" INTEGER,
  "moeda" TEXT NOT NULL DEFAULT 'BRL',
  "subtotalCentavos" INTEGER NOT NULL,
  "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
  "totalCentavos" INTEGER NOT NULL,
  "propostaRevisao" INTEGER,
  "etapaAbertaAnterior" TEXT NOT NULL,
  "revisao" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "fechadoEm" DATETIME NOT NULL,
  "fechadoPorId" INTEGER NOT NULL,
  "invalidadoEm" DATETIME,
  "invalidadoPorId" INTEGER,
  "motivoInvalidacao" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "VendaCanonica_origem_ck" CHECK ("origem" IN ('ACCEPTED_PROPOSAL','MANUAL_CLOSE')),
  CONSTRAINT "VendaCanonica_status_ck" CHECK ("status" IN ('ACTIVE','INVALIDATED')),
  CONSTRAINT "VendaCanonica_moeda_ck" CHECK ("moeda" = 'BRL'),
  CONSTRAINT "VendaCanonica_etapa_anterior_ck" CHECK ("etapaAbertaAnterior" IN ('NOVO','CONTATO','PROPOSTA')),
  CONSTRAINT "VendaCanonica_revisao_ck" CHECK ("revisao" >= 1),
  CONSTRAINT "VendaCanonica_money_ck" CHECK (
    "subtotalCentavos" >= 0 AND "subtotalCentavos" <= 2147483647
    AND "descontoCentavos" >= 0 AND "descontoCentavos" <= "subtotalCentavos"
    AND "totalCentavos" = "subtotalCentavos" - "descontoCentavos"
  ),
  CONSTRAINT "VendaCanonica_source_ck" CHECK (
    ("origem" = 'ACCEPTED_PROPOSAL' AND "propostaVencedoraId" IS NOT NULL AND "propostaRevisao" IS NOT NULL)
    OR ("origem" = 'MANUAL_CLOSE' AND "propostaVencedoraId" IS NULL AND "propostaRevisao" IS NULL
      AND "descontoCentavos" = 0 AND "subtotalCentavos" = "totalCentavos")
  ),
  CONSTRAINT "VendaCanonica_lifecycle_ck" CHECK (
    ("status" = 'ACTIVE' AND "invalidadoEm" IS NULL AND "invalidadoPorId" IS NULL AND "motivoInvalidacao" IS NULL)
    OR ("status" = 'INVALIDATED' AND "invalidadoEm" IS NOT NULL AND "invalidadoPorId" IS NOT NULL AND "motivoInvalidacao" IS NOT NULL)
  ),
  CONSTRAINT "VendaCanonica_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "VendaCanonica_empresaId_clienteId_negocioId_fkey" FOREIGN KEY ("empresaId", "clienteId", "negocioId") REFERENCES "Negocio"("empresaId", "clienteId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "VendaCanonica_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "VendaCanonica_empresaId_negocioId_propostaVencedoraId_fkey" FOREIGN KEY ("empresaId", "negocioId", "propostaVencedoraId") REFERENCES "PropostaComercial"("empresaId", "negocioId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "VendaCanonica_empresaId_fechadoPorId_fkey" FOREIGN KEY ("empresaId", "fechadoPorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "VendaCanonica_empresaId_invalidadoPorId_fkey" FOREIGN KEY ("empresaId", "invalidadoPorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "VendaCanonica_empresaId_id_key" ON "VendaCanonica"("empresaId", "id");
CREATE UNIQUE INDEX "VendaCanonica_empresaId_negocioId_id_key" ON "VendaCanonica"("empresaId", "negocioId", "id");
CREATE UNIQUE INDEX "VendaCanonica_empresaId_id_propostaVencedoraId_key" ON "VendaCanonica"("empresaId", "id", "propostaVencedoraId");
CREATE UNIQUE INDEX "VendaCanonica_empresaId_negocioId_revisao_key" ON "VendaCanonica"("empresaId", "negocioId", "revisao");
CREATE UNIQUE INDEX "VendaCanonica_empresaId_idempotencyKey_key" ON "VendaCanonica"("empresaId", "idempotencyKey");
CREATE UNIQUE INDEX "VendaCanonica_one_active_per_deal_key" ON "VendaCanonica"("empresaId", "negocioId") WHERE "status" = 'ACTIVE';
CREATE INDEX "VendaCanonica_empresaId_clienteId_status_fechadoEm_idx" ON "VendaCanonica"("empresaId", "clienteId", "status", "fechadoEm");
CREATE INDEX "VendaCanonica_empresaId_negocioId_status_idx" ON "VendaCanonica"("empresaId", "negocioId", "status");
CREATE INDEX "VendaCanonica_empresaId_propostaVencedoraId_idx" ON "VendaCanonica"("empresaId", "propostaVencedoraId");

CREATE TABLE "ItemVendaCanonica" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "empresaId" INTEGER NOT NULL,
  "vendaId" INTEGER NOT NULL,
  "propostaIdOriginal" INTEGER,
  "propostaItemId" INTEGER,
  "itemTypeOriginal" TEXT,
  "productOfferIdOriginal" TEXT,
  "catalogProductIdOriginal" INTEGER,
  "stockProductIdOriginal" INTEGER,
  "descricao" TEXT NOT NULL,
  "productNameSnapshot" TEXT,
  "skuSnapshot" TEXT,
  "unitSnapshot" TEXT,
  "quantidade" DECIMAL NOT NULL,
  "valorUnitarioCentavos" INTEGER NOT NULL,
  "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
  "subtotalCentavos" INTEGER NOT NULL,
  "totalCentavos" INTEGER NOT NULL,
  "moeda" TEXT NOT NULL DEFAULT 'BRL',
  "catalogRevision" INTEGER,
  "stockMaterialVersion" INTEGER,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemVendaCanonica_item_type_ck" CHECK ("itemTypeOriginal" IS NULL OR "itemTypeOriginal" IN ('CATALOG_ITEM','LEGACY_ITEM')),
  CONSTRAINT "ItemVendaCanonica_moeda_ck" CHECK ("moeda" = 'BRL'),
  CONSTRAINT "ItemVendaCanonica_money_ck" CHECK (
    "valorUnitarioCentavos" >= 0 AND "valorUnitarioCentavos" <= 2147483647
    AND "quantidade" > 0
    AND "subtotalCentavos" >= 0 AND "subtotalCentavos" <= 2147483647
    AND "subtotalCentavos" = CAST(ROUND("quantidade" * "valorUnitarioCentavos", 0) AS INTEGER)
    AND "descontoCentavos" >= 0 AND "descontoCentavos" <= "subtotalCentavos"
    AND "totalCentavos" = "subtotalCentavos" - "descontoCentavos"
  ),
  CONSTRAINT "ItemVendaCanonica_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ItemVendaCanonica_empresaId_vendaId_fkey" FOREIGN KEY ("empresaId", "vendaId") REFERENCES "VendaCanonica"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ItemVendaCanonica_empresaId_vendaId_propostaIdOriginal_fkey" FOREIGN KEY ("empresaId", "vendaId", "propostaIdOriginal") REFERENCES "VendaCanonica"("empresaId", "id", "propostaVencedoraId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ItemVendaCanonica_empresaId_propostaIdOriginal_propostaItemId_fkey" FOREIGN KEY ("empresaId", "propostaIdOriginal", "propostaItemId") REFERENCES "ItemPropostaComercial"("empresaId", "propostaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ItemVendaCanonica_proposal_source_ck" CHECK (("propostaIdOriginal" IS NULL AND "propostaItemId" IS NULL) OR ("propostaIdOriginal" IS NOT NULL AND "propostaItemId" IS NOT NULL))
);

CREATE UNIQUE INDEX "ItemVendaCanonica_empresaId_id_key" ON "ItemVendaCanonica"("empresaId", "id");
CREATE INDEX "ItemVendaCanonica_empresaId_vendaId_ordem_idx" ON "ItemVendaCanonica"("empresaId", "vendaId", "ordem");
CREATE INDEX "ItemVendaCanonica_empresaId_propostaIdOriginal_idx" ON "ItemVendaCanonica"("empresaId", "propostaIdOriginal");
CREATE INDEX "ItemVendaCanonica_empresaId_propostaItemId_idx" ON "ItemVendaCanonica"("empresaId", "propostaItemId");

CREATE TABLE "HistoricoVendaCanonica" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "empresaId" INTEGER NOT NULL,
  "vendaId" INTEGER NOT NULL,
  "negocioId" INTEGER NOT NULL,
  "autorId" INTEGER NOT NULL,
  "acao" TEXT NOT NULL,
  "statusAnterior" TEXT,
  "statusNovo" TEXT NOT NULL,
  "motivo" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HistoricoVendaCanonica_acao_ck" CHECK ("acao" IN ('CREATE','INVALIDATE')),
  CONSTRAINT "HistoricoVendaCanonica_status_anterior_ck" CHECK ("statusAnterior" IS NULL OR "statusAnterior" IN ('ACTIVE','INVALIDATED')),
  CONSTRAINT "HistoricoVendaCanonica_status_novo_ck" CHECK ("statusNovo" IN ('ACTIVE','INVALIDATED')),
  CONSTRAINT "HistoricoVendaCanonica_transition_ck" CHECK (
    ("acao" = 'CREATE' AND "statusAnterior" IS NULL AND "statusNovo" = 'ACTIVE' AND "motivo" IS NULL)
    OR ("acao" = 'INVALIDATE' AND "statusAnterior" = 'ACTIVE' AND "statusNovo" = 'INVALIDATED' AND "motivo" IS NOT NULL)
  ),
  CONSTRAINT "HistoricoVendaCanonica_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "HistoricoVendaCanonica_empresaId_negocioId_vendaId_fkey" FOREIGN KEY ("empresaId", "negocioId", "vendaId") REFERENCES "VendaCanonica"("empresaId", "negocioId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "HistoricoVendaCanonica_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "HistoricoVendaCanonica_empresaId_autorId_fkey" FOREIGN KEY ("empresaId", "autorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "HistoricoVendaCanonica_empresaId_vendaId_acao_key" ON "HistoricoVendaCanonica"("empresaId", "vendaId", "acao");
CREATE INDEX "HistoricoVendaCanonica_empresaId_vendaId_createdAt_idx" ON "HistoricoVendaCanonica"("empresaId", "vendaId", "createdAt");
CREATE INDEX "HistoricoVendaCanonica_empresaId_negocioId_createdAt_idx" ON "HistoricoVendaCanonica"("empresaId", "negocioId", "createdAt");
CREATE INDEX "HistoricoVendaCanonica_empresaId_autorId_createdAt_idx" ON "HistoricoVendaCanonica"("empresaId", "autorId", "createdAt");

CREATE TRIGGER "ItemVendaCanonica_only_proposal_sale_insert"
BEFORE INSERT ON "ItemVendaCanonica"
WHEN NOT EXISTS (
  SELECT 1 FROM "VendaCanonica" AS sale
  WHERE sale."empresaId" = NEW."empresaId"
    AND sale."id" = NEW."vendaId"
    AND sale."origem" = 'ACCEPTED_PROPOSAL'
    AND sale."propostaVencedoraId" = NEW."propostaIdOriginal"
)
OR EXISTS (
  SELECT 1 FROM "HistoricoVendaCanonica" AS history
  WHERE history."empresaId" = NEW."empresaId"
    AND history."vendaId" = NEW."vendaId"
)
BEGIN
  SELECT RAISE(ABORT, 'CANONICAL_SALE_ITEM_SOURCE_INVALID');
END;

CREATE TRIGGER "HistoricoVendaCanonica_state_insert"
BEFORE INSERT ON "HistoricoVendaCanonica"
WHEN (NEW."acao" = 'CREATE' AND NOT EXISTS (
  SELECT 1 FROM "VendaCanonica" AS sale
  WHERE sale."empresaId" = NEW."empresaId" AND sale."id" = NEW."vendaId" AND sale."status" = 'ACTIVE'
)) OR (NEW."acao" = 'INVALIDATE' AND NOT EXISTS (
  SELECT 1 FROM "VendaCanonica" AS sale
  WHERE sale."empresaId" = NEW."empresaId" AND sale."id" = NEW."vendaId" AND sale."status" = 'INVALIDATED'
))
BEGIN
  SELECT RAISE(ABORT, 'CANONICAL_SALE_HISTORY_STATE_INVALID');
END;

CREATE TABLE "NegocioContratoVenda" (
  "empresaId" INTEGER NOT NULL,
  "negocioId" INTEGER NOT NULL,
  "propostaPrincipalId" INTEGER,
  "propostaVencedoraId" INTEGER,
  "vendaAtivaId" INTEGER,
  "revisao" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("empresaId", "negocioId"),
  CONSTRAINT "NegocioContratoVenda_revisao_ck" CHECK ("revisao" >= 1),
  CONSTRAINT "NegocioContratoVenda_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "NegocioContratoVenda_empresaId_negocioId_fkey" FOREIGN KEY ("empresaId", "negocioId") REFERENCES "Negocio"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "NegocioContratoVenda_empresaId_negocioId_propostaPrincipalId_fkey" FOREIGN KEY ("empresaId", "negocioId", "propostaPrincipalId") REFERENCES "PropostaComercial"("empresaId", "negocioId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "NegocioContratoVenda_empresaId_negocioId_propostaVencedoraId_fkey" FOREIGN KEY ("empresaId", "negocioId", "propostaVencedoraId") REFERENCES "PropostaComercial"("empresaId", "negocioId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "NegocioContratoVenda_empresaId_negocioId_vendaAtivaId_fkey" FOREIGN KEY ("empresaId", "negocioId", "vendaAtivaId") REFERENCES "VendaCanonica"("empresaId", "negocioId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "NegocioContratoVenda_empresaId_propostaPrincipalId_idx" ON "NegocioContratoVenda"("empresaId", "propostaPrincipalId");
CREATE INDEX "NegocioContratoVenda_empresaId_propostaVencedoraId_idx" ON "NegocioContratoVenda"("empresaId", "propostaVencedoraId");
CREATE INDEX "NegocioContratoVenda_empresaId_vendaAtivaId_idx" ON "NegocioContratoVenda"("empresaId", "vendaAtivaId");

-- Snapshot fields are immutable. Reopening may only change lifecycle/audit fields.
CREATE TRIGGER "VendaCanonica_snapshot_immutable_update"
BEFORE UPDATE ON "VendaCanonica"
WHEN NEW."empresaId" IS NOT OLD."empresaId"
  OR NEW."negocioId" IS NOT OLD."negocioId"
  OR NEW."clienteId" IS NOT OLD."clienteId"
  OR NEW."origem" IS NOT OLD."origem"
  OR NEW."propostaVencedoraId" IS NOT OLD."propostaVencedoraId"
  OR NEW."moeda" IS NOT OLD."moeda"
  OR NEW."subtotalCentavos" IS NOT OLD."subtotalCentavos"
  OR NEW."descontoCentavos" IS NOT OLD."descontoCentavos"
  OR NEW."totalCentavos" IS NOT OLD."totalCentavos"
  OR NEW."propostaRevisao" IS NOT OLD."propostaRevisao"
  OR NEW."etapaAbertaAnterior" IS NOT OLD."etapaAbertaAnterior"
  OR NEW."revisao" IS NOT OLD."revisao"
  OR NEW."idempotencyKey" IS NOT OLD."idempotencyKey"
  OR NEW."requestFingerprint" IS NOT OLD."requestFingerprint"
  OR NEW."fechadoEm" IS NOT OLD."fechadoEm"
  OR NEW."fechadoPorId" IS NOT OLD."fechadoPorId"
  OR NEW."createdAt" IS NOT OLD."createdAt"
BEGIN
  SELECT RAISE(ABORT, 'CANONICAL_SALE_SNAPSHOT_IMMUTABLE');
END;

CREATE TRIGGER "ItemVendaCanonica_snapshot_immutable_update"
BEFORE UPDATE ON "ItemVendaCanonica"
BEGIN
  SELECT RAISE(ABORT, 'CANONICAL_SALE_ITEM_IMMUTABLE');
END;

CREATE TRIGGER "HistoricoVendaCanonica_immutable_update"
BEFORE UPDATE ON "HistoricoVendaCanonica"
BEGIN
  SELECT RAISE(ABORT, 'CANONICAL_SALE_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER "VendaCanonica_immutable_delete"
BEFORE DELETE ON "VendaCanonica"
BEGIN
  SELECT RAISE(ABORT, 'CANONICAL_SALE_DELETE_FORBIDDEN');
END;

CREATE TRIGGER "ItemVendaCanonica_immutable_delete"
BEFORE DELETE ON "ItemVendaCanonica"
BEGIN
  SELECT RAISE(ABORT, 'CANONICAL_SALE_ITEM_DELETE_FORBIDDEN');
END;

CREATE TRIGGER "HistoricoVendaCanonica_immutable_delete"
BEFORE DELETE ON "HistoricoVendaCanonica"
BEGIN
  SELECT RAISE(ABORT, 'CANONICAL_SALE_HISTORY_DELETE_FORBIDDEN');
END;
