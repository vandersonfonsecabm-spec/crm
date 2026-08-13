ALTER TABLE "Cliente" ADD COLUMN "arquivadoEm" TIMESTAMP(3);
ALTER TABLE "Cliente" ADD COLUMN "statusAntesDeArquivar" TEXT;
CREATE INDEX "Cliente_empresaId_arquivadoEm_idx" ON "Cliente"("empresaId", "arquivadoEm");
ALTER TABLE "Nota"
  DROP CONSTRAINT IF EXISTS "Nota_empresaId_clienteId_fkey",
  ADD CONSTRAINT "Nota_empresaId_clienteId_fkey"
    FOREIGN KEY ("empresaId", "clienteId")
    REFERENCES "Cliente"("empresaId", "id")
    ON DELETE RESTRICT
    ON UPDATE RESTRICT;
