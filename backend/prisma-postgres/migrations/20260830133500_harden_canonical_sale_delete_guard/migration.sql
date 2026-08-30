BEGIN;

-- A venda canônica é append-only em qualquer sessão da aplicação. Cleanup de
-- testes deve descartar o banco inteiro, nunca abrir uma exceção no schema.
CREATE OR REPLACE FUNCTION "guardCanonicalSaleDeleteV1"() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_SALE_DELETE_FORBIDDEN'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "guardCanonicalSaleTruncateV1"() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_SALE_TRUNCATE_FORBIDDEN'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "NegocioContratoVenda_no_delete_v1" ON "NegocioContratoVenda";
CREATE TRIGGER "NegocioContratoVenda_no_delete_v1"
BEFORE DELETE ON "NegocioContratoVenda"
FOR EACH ROW EXECUTE FUNCTION "guardCanonicalSaleDeleteV1"();

DROP TRIGGER IF EXISTS "VendaCanonica_no_truncate_v1" ON "VendaCanonica";
CREATE TRIGGER "VendaCanonica_no_truncate_v1"
BEFORE TRUNCATE ON "VendaCanonica"
FOR EACH STATEMENT EXECUTE FUNCTION "guardCanonicalSaleTruncateV1"();

DROP TRIGGER IF EXISTS "ItemVendaCanonica_no_truncate_v1" ON "ItemVendaCanonica";
CREATE TRIGGER "ItemVendaCanonica_no_truncate_v1"
BEFORE TRUNCATE ON "ItemVendaCanonica"
FOR EACH STATEMENT EXECUTE FUNCTION "guardCanonicalSaleTruncateV1"();

DROP TRIGGER IF EXISTS "HistoricoVendaCanonica_no_truncate_v1" ON "HistoricoVendaCanonica";
CREATE TRIGGER "HistoricoVendaCanonica_no_truncate_v1"
BEFORE TRUNCATE ON "HistoricoVendaCanonica"
FOR EACH STATEMENT EXECUTE FUNCTION "guardCanonicalSaleTruncateV1"();

DROP TRIGGER IF EXISTS "NegocioContratoVenda_no_truncate_v1" ON "NegocioContratoVenda";
CREATE TRIGGER "NegocioContratoVenda_no_truncate_v1"
BEFORE TRUNCATE ON "NegocioContratoVenda"
FOR EACH STATEMENT EXECUTE FUNCTION "guardCanonicalSaleTruncateV1"();

COMMIT;
