-- SQLite never exposed the PostgreSQL session bypass, but the commercial
-- contract must also remain append-only because it anchors realized revenue.
CREATE TRIGGER "NegocioContratoVenda_no_delete_v1"
BEFORE DELETE ON "NegocioContratoVenda"
BEGIN
  SELECT RAISE(ABORT, 'CANONICAL_SALE_DELETE_FORBIDDEN');
END;
