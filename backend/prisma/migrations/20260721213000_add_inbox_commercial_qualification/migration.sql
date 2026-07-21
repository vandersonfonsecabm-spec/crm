CREATE TABLE "HistoricoQualificacaoConversa" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "empresaId" INTEGER NOT NULL,
  "conversaCanalId" INTEGER NOT NULL,
  "clienteId" INTEGER NOT NULL,
  "leadId" INTEGER NOT NULL,
  "negocioId" INTEGER,
  "autorId" INTEGER NOT NULL,
  "acao" TEXT NOT NULL,
  "interesse" TEXT,
  "prioridade" TEXT,
  "valorEstimado" INTEGER,
  "proximaAcao" TEXT,
  "dataRetorno" DATETIME,
  "observacao" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HistoricoQualificacaoConversa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HistoricoQualificacaoConversa_conversaCanalId_fkey" FOREIGN KEY ("conversaCanalId") REFERENCES "ConversaCanal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HistoricoQualificacaoConversa_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HistoricoQualificacaoConversa_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HistoricoQualificacaoConversa_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "HistoricoQualificacaoConversa_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "HistoricoQualificacaoConversa_empresaId_conversaCanalId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "conversaCanalId", "createdAt");
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_clienteId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "clienteId", "createdAt");
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_leadId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "leadId", "createdAt");
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_negocioId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "negocioId", "createdAt");
CREATE INDEX "HistoricoQualificacaoConversa_empresaId_autorId_createdAt_idx" ON "HistoricoQualificacaoConversa"("empresaId", "autorId", "createdAt");
