BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PropostaComercial" AS proposta
    LEFT JOIN "Negocio" AS negocio
      ON negocio."empresaId" = proposta."empresaId"
     AND negocio."id" = proposta."negocioId"
     AND negocio."clienteId" = proposta."clienteId"
    WHERE negocio."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'CANONICAL_SALE_LEGACY_CUSTOMER_CONFLICT' USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TYPE "StatusPropostaComercial" ADD VALUE IF NOT EXISTS 'SUBSTITUIDA';
ALTER TYPE "TipoAcaoPropostaComercial" ADD VALUE IF NOT EXISTS 'DEFINIR_PRINCIPAL';
ALTER TYPE "TipoAcaoPropostaComercial" ADD VALUE IF NOT EXISTS 'REMOVER_PRINCIPAL';
ALTER TYPE "TipoAcaoPropostaComercial" ADD VALUE IF NOT EXISTS 'ACEITAR_COMO_VENCEDORA';
ALTER TYPE "TipoAcaoPropostaComercial" ADD VALUE IF NOT EXISTS 'SUBSTITUIR_VENCEDORA';
ALTER TYPE "TipoAcaoPropostaComercial" ADD VALUE IF NOT EXISTS 'RECONCILIAR_VENCEDORA';
ALTER TYPE "TipoAcaoPropostaComercial" ADD VALUE IF NOT EXISTS 'REMOVER_VENCEDORA';

CREATE TYPE "OrigemVendaCanonica" AS ENUM ('ACCEPTED_PROPOSAL', 'MANUAL_CLOSE');
CREATE TYPE "StatusVendaCanonica" AS ENUM ('ACTIVE', 'INVALIDATED');
CREATE TYPE "MoedaVendaCanonica" AS ENUM ('BRL');
CREATE TYPE "TipoAcaoVendaCanonica" AS ENUM ('CREATE', 'INVALIDATE');

ALTER TABLE "PropostaComercial" ADD COLUMN "moeda" TEXT NOT NULL DEFAULT 'BRL';
CREATE UNIQUE INDEX "PropostaComercial_empresaId_negocioId_id_key" ON "PropostaComercial"("empresaId", "negocioId", "id");
CREATE UNIQUE INDEX "Negocio_empresaId_clienteId_id_key" ON "Negocio"("empresaId", "clienteId", "id");
CREATE UNIQUE INDEX "ItemPropostaComercial_empresaId_propostaId_id_key" ON "ItemPropostaComercial"("empresaId", "propostaId", "id");

CREATE TABLE "VendaCanonica" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "negocioId" INTEGER NOT NULL,
  "clienteId" INTEGER NOT NULL,
  "origem" "OrigemVendaCanonica" NOT NULL,
  "status" "StatusVendaCanonica" NOT NULL DEFAULT 'ACTIVE',
  "propostaVencedoraId" INTEGER,
  "moeda" "MoedaVendaCanonica" NOT NULL DEFAULT 'BRL',
  "subtotalCentavos" INTEGER NOT NULL,
  "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
  "totalCentavos" INTEGER NOT NULL,
  "propostaRevisao" INTEGER,
  "etapaAbertaAnterior" "EtapaNegocio" NOT NULL,
  "revisao" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "fechadoEm" TIMESTAMP(3) NOT NULL,
  "fechadoPorId" INTEGER NOT NULL,
  "invalidadoEm" TIMESTAMP(3),
  "invalidadoPorId" INTEGER,
  "motivoInvalidacao" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendaCanonica_pkey" PRIMARY KEY ("id"),
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
    OR ("status" = 'INVALIDATED' AND "invalidadoEm" IS NOT NULL AND "invalidadoPorId" IS NOT NULL AND "motivoInvalidacao" IS NOT NULL AND btrim("motivoInvalidacao") <> '')
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
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "vendaId" INTEGER NOT NULL,
  "propostaIdOriginal" INTEGER,
  "propostaItemId" INTEGER,
  "itemTypeOriginal" "TipoItemPropostaComercial",
  "productOfferIdOriginal" TEXT,
  "catalogProductIdOriginal" INTEGER,
  "stockProductIdOriginal" INTEGER,
  "descricao" TEXT NOT NULL,
  "productNameSnapshot" TEXT,
  "skuSnapshot" TEXT,
  "unitSnapshot" TEXT,
  "quantidade" DECIMAL(65,30) NOT NULL,
  "valorUnitarioCentavos" INTEGER NOT NULL,
  "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
  "subtotalCentavos" INTEGER NOT NULL,
  "totalCentavos" INTEGER NOT NULL,
  "moeda" "MoedaVendaCanonica" NOT NULL DEFAULT 'BRL',
  "catalogRevision" INTEGER,
  "stockMaterialVersion" INTEGER,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemVendaCanonica_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ItemVendaCanonica_money_ck" CHECK (
    "valorUnitarioCentavos" >= 0 AND "valorUnitarioCentavos" <= 2147483647
    AND "quantidade" > 0
    AND "subtotalCentavos" >= 0 AND "subtotalCentavos" <= 2147483647
    AND "subtotalCentavos" = ROUND("quantidade" * "valorUnitarioCentavos")
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
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "vendaId" INTEGER NOT NULL,
  "negocioId" INTEGER NOT NULL,
  "autorId" INTEGER NOT NULL,
  "acao" "TipoAcaoVendaCanonica" NOT NULL,
  "statusAnterior" "StatusVendaCanonica",
  "statusNovo" "StatusVendaCanonica" NOT NULL,
  "motivo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HistoricoVendaCanonica_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HistoricoVendaCanonica_transition_ck" CHECK (
    ("acao" = 'CREATE' AND "statusAnterior" IS NULL AND "statusNovo" = 'ACTIVE' AND "motivo" IS NULL)
    OR ("acao" = 'INVALIDATE' AND "statusAnterior" = 'ACTIVE' AND "statusNovo" = 'INVALIDATED' AND "motivo" IS NOT NULL AND btrim("motivo") <> '')
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

CREATE FUNCTION "guardCanonicalSaleItemInsertV1"() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "VendaCanonica" AS sale
    WHERE sale."empresaId" = NEW."empresaId"
      AND sale."id" = NEW."vendaId"
      AND sale."origem" = 'ACCEPTED_PROPOSAL'
      AND sale."propostaVencedoraId" = NEW."propostaIdOriginal"
  ) OR EXISTS (
    SELECT 1 FROM "HistoricoVendaCanonica" AS history
    WHERE history."empresaId" = NEW."empresaId"
      AND history."vendaId" = NEW."vendaId"
  ) THEN
    RAISE EXCEPTION 'CANONICAL_SALE_ITEM_SOURCE_INVALID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ItemVendaCanonica_only_proposal_sale_insert"
BEFORE INSERT ON "ItemVendaCanonica"
FOR EACH ROW EXECUTE FUNCTION "guardCanonicalSaleItemInsertV1"();

CREATE FUNCTION "guardCanonicalSaleHistoryInsertV1"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."acao" = 'CREATE' AND NOT EXISTS (
    SELECT 1 FROM "VendaCanonica" AS sale
    WHERE sale."empresaId" = NEW."empresaId" AND sale."id" = NEW."vendaId" AND sale."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'CANONICAL_SALE_HISTORY_STATE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF NEW."acao" = 'INVALIDATE' AND NOT EXISTS (
    SELECT 1 FROM "VendaCanonica" AS sale
    WHERE sale."empresaId" = NEW."empresaId" AND sale."id" = NEW."vendaId" AND sale."status" = 'INVALIDATED'
  ) THEN
    RAISE EXCEPTION 'CANONICAL_SALE_HISTORY_STATE_INVALID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "HistoricoVendaCanonica_state_insert"
BEFORE INSERT ON "HistoricoVendaCanonica"
FOR EACH ROW EXECUTE FUNCTION "guardCanonicalSaleHistoryInsertV1"();

CREATE TABLE "NegocioContratoVenda" (
  "empresaId" INTEGER NOT NULL,
  "negocioId" INTEGER NOT NULL,
  "propostaPrincipalId" INTEGER,
  "propostaVencedoraId" INTEGER,
  "vendaAtivaId" INTEGER,
  "revisao" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NegocioContratoVenda_pkey" PRIMARY KEY ("empresaId", "negocioId"),
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

CREATE FUNCTION "guardNegocioContratoVendaCustomerV1"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."propostaPrincipalId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "Negocio" AS negocio
    JOIN "PropostaComercial" AS proposta
      ON proposta."empresaId" = negocio."empresaId"
     AND proposta."negocioId" = negocio."id"
     AND proposta."id" = NEW."propostaPrincipalId"
     AND proposta."clienteId" = negocio."clienteId"
    WHERE negocio."empresaId" = NEW."empresaId" AND negocio."id" = NEW."negocioId"
  ) THEN
    RAISE EXCEPTION 'NEGOCIO_CONTRATO_VENDA_CUSTOMER_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF NEW."propostaVencedoraId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "Negocio" AS negocio
    JOIN "PropostaComercial" AS proposta
      ON proposta."empresaId" = negocio."empresaId"
     AND proposta."negocioId" = negocio."id"
     AND proposta."id" = NEW."propostaVencedoraId"
     AND proposta."clienteId" = negocio."clienteId"
    WHERE negocio."empresaId" = NEW."empresaId" AND negocio."id" = NEW."negocioId"
  ) THEN
    RAISE EXCEPTION 'NEGOCIO_CONTRATO_VENDA_CUSTOMER_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NegocioContratoVenda_customer_consistency"
BEFORE INSERT OR UPDATE OF "empresaId", "negocioId", "propostaPrincipalId", "propostaVencedoraId"
ON "NegocioContratoVenda"
FOR EACH ROW EXECUTE FUNCTION "guardNegocioContratoVendaCustomerV1"();

CREATE FUNCTION "guardPropostaComercialCustomerConsistencyV1"() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Negocio" AS negocio
    WHERE negocio."empresaId" = NEW."empresaId"
      AND negocio."id" = NEW."negocioId"
      AND negocio."clienteId" = NEW."clienteId"
  ) THEN
    RAISE EXCEPTION 'PROPOSTA_COMERCIAL_CUSTOMER_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PropostaComercial_customer_consistency"
BEFORE INSERT OR UPDATE OF "empresaId", "negocioId", "clienteId"
ON "PropostaComercial"
FOR EACH ROW EXECUTE FUNCTION "guardPropostaComercialCustomerConsistencyV1"();

CREATE FUNCTION "guardNegocioCustomerReparentV1"() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "PropostaComercial" AS proposta
    WHERE proposta."empresaId" = OLD."empresaId"
      AND proposta."negocioId" = OLD."id"
      AND (
        proposta."empresaId" IS DISTINCT FROM NEW."empresaId"
        OR proposta."negocioId" IS DISTINCT FROM NEW."id"
        OR proposta."clienteId" IS DISTINCT FROM NEW."clienteId"
      )
  ) THEN
    RAISE EXCEPTION 'NEGOCIO_CUSTOMER_REPARENT_FORBIDDEN' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Negocio_customer_reparent_guard"
BEFORE UPDATE OF "empresaId", "id", "clienteId"
ON "Negocio"
FOR EACH ROW EXECUTE FUNCTION "guardNegocioCustomerReparentV1"();

CREATE FUNCTION "guardVendaCanonicaSnapshotV1"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."empresaId" IS DISTINCT FROM OLD."empresaId"
    OR NEW."negocioId" IS DISTINCT FROM OLD."negocioId"
    OR NEW."clienteId" IS DISTINCT FROM OLD."clienteId"
    OR NEW."origem" IS DISTINCT FROM OLD."origem"
    OR NEW."propostaVencedoraId" IS DISTINCT FROM OLD."propostaVencedoraId"
    OR NEW."moeda" IS DISTINCT FROM OLD."moeda"
    OR NEW."subtotalCentavos" IS DISTINCT FROM OLD."subtotalCentavos"
    OR NEW."descontoCentavos" IS DISTINCT FROM OLD."descontoCentavos"
    OR NEW."totalCentavos" IS DISTINCT FROM OLD."totalCentavos"
    OR NEW."propostaRevisao" IS DISTINCT FROM OLD."propostaRevisao"
    OR NEW."etapaAbertaAnterior" IS DISTINCT FROM OLD."etapaAbertaAnterior"
    OR NEW."revisao" IS DISTINCT FROM OLD."revisao"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."requestFingerprint" IS DISTINCT FROM OLD."requestFingerprint"
    OR NEW."fechadoEm" IS DISTINCT FROM OLD."fechadoEm"
    OR NEW."fechadoPorId" IS DISTINCT FROM OLD."fechadoPorId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'CANONICAL_SALE_SNAPSHOT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" = 'INVALIDATED' AND (
    NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."invalidadoEm" IS DISTINCT FROM OLD."invalidadoEm"
    OR NEW."invalidadoPorId" IS DISTINCT FROM OLD."invalidadoPorId"
    OR NEW."motivoInvalidacao" IS DISTINCT FROM OLD."motivoInvalidacao"
  ) THEN
    RAISE EXCEPTION 'CANONICAL_SALE_LIFECYCLE_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" <> 'ACTIVE' OR NEW."status" NOT IN ('ACTIVE', 'INVALIDATED') THEN
    RAISE EXCEPTION 'CANONICAL_SALE_LIFECYCLE_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" = 'ACTIVE' AND NEW."status" = 'INVALIDATED' AND (
    NEW."invalidadoEm" IS NULL
    OR NEW."invalidadoPorId" IS NULL
    OR NEW."motivoInvalidacao" IS NULL
    OR btrim(NEW."motivoInvalidacao") = ''
  ) THEN
    RAISE EXCEPTION 'CANONICAL_SALE_LIFECYCLE_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "VendaCanonica_snapshot_immutable_update"
BEFORE UPDATE ON "VendaCanonica"
FOR EACH ROW EXECUTE FUNCTION "guardVendaCanonicaSnapshotV1"();

CREATE FUNCTION "guardCanonicalSaleAppendOnlyV1"() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_SALE_APPEND_ONLY' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ItemVendaCanonica_snapshot_immutable_update"
BEFORE UPDATE ON "ItemVendaCanonica"
FOR EACH ROW EXECUTE FUNCTION "guardCanonicalSaleAppendOnlyV1"();

CREATE TRIGGER "HistoricoVendaCanonica_immutable_update"
BEFORE UPDATE ON "HistoricoVendaCanonica"
FOR EACH ROW EXECUTE FUNCTION "guardCanonicalSaleAppendOnlyV1"();

CREATE FUNCTION "guardCanonicalSaleDeleteV1"() RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('crm.allow_canonical_sale_delete', TRUE) IS DISTINCT FROM 'test-cleanup' THEN
    RAISE EXCEPTION 'CANONICAL_SALE_DELETE_FORBIDDEN' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "VendaCanonica_immutable_delete"
BEFORE DELETE ON "VendaCanonica"
FOR EACH ROW EXECUTE FUNCTION "guardCanonicalSaleDeleteV1"();

CREATE TRIGGER "ItemVendaCanonica_immutable_delete"
BEFORE DELETE ON "ItemVendaCanonica"
FOR EACH ROW EXECUTE FUNCTION "guardCanonicalSaleDeleteV1"();

CREATE TRIGGER "HistoricoVendaCanonica_immutable_delete"
BEFORE DELETE ON "HistoricoVendaCanonica"
FOR EACH ROW EXECUTE FUNCTION "guardCanonicalSaleDeleteV1"();

COMMIT;
