-- Additive conversion metadata and a database guarantee of one business per lead.
ALTER TABLE "Negocio" ADD COLUMN "convertidoPorId" INTEGER REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Negocio" ADD COLUMN "statusLeadAnterior" TEXT;
ALTER TABLE "Negocio" ADD COLUMN "titulo" TEXT;
ALTER TABLE "Negocio" ADD COLUMN "observacao" TEXT;

CREATE UNIQUE INDEX "Negocio_leadId_key" ON "Negocio"("leadId");
CREATE INDEX "Negocio_empresaId_convertidoPorId_createdAt_idx" ON "Negocio"("empresaId", "convertidoPorId", "createdAt");
