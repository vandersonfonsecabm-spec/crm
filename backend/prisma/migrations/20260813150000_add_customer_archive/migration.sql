ALTER TABLE "Cliente" ADD COLUMN "arquivadoEm" DATETIME;
ALTER TABLE "Cliente" ADD COLUMN "statusAntesDeArquivar" TEXT;
CREATE INDEX "Cliente_empresaId_arquivadoEm_idx" ON "Cliente"("empresaId", "arquivadoEm");
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Nota" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'nota',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clienteId" INTEGER NOT NULL,
    CONSTRAINT "Nota_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Nota_empresaId_clienteId_fkey" FOREIGN KEY ("empresaId", "clienteId") REFERENCES "Cliente" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_Nota" ("clienteId", "createdAt", "empresaId", "id", "texto", "tipo") SELECT "clienteId", "createdAt", "empresaId", "id", "texto", "tipo" FROM "Nota";
DROP TABLE "Nota";
ALTER TABLE "new_Nota" RENAME TO "Nota";
CREATE INDEX "Nota_empresaId_idx" ON "Nota"("empresaId");
CREATE INDEX "Nota_clienteId_idx" ON "Nota"("clienteId");
CREATE INDEX "Nota_empresaId_clienteId_idx" ON "Nota"("empresaId", "clienteId");
CREATE INDEX "Nota_empresaId_createdAt_idx" ON "Nota"("empresaId", "createdAt");
PRAGMA foreign_keys=ON;
