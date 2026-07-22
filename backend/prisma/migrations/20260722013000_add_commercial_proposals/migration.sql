CREATE TABLE "PropostaComercial" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "empresaId" INTEGER NOT NULL,
  "clienteId" INTEGER NOT NULL,
  "negocioId" INTEGER NOT NULL,
  "leadId" INTEGER,
  "responsavelId" INTEGER,
  "autorId" INTEGER NOT NULL,
  "propostaOrigemId" INTEGER,
  "codigo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT,
  "descontoGeralCentavos" INTEGER NOT NULL DEFAULT 0,
  "subtotalCentavos" INTEGER NOT NULL DEFAULT 0,
  "totalCentavos" INTEGER NOT NULL DEFAULT 0,
  "validade" DATETIME NOT NULL,
  "observacoes" TEXT,
  "condicoesComerciais" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
  "versao" INTEGER NOT NULL DEFAULT 1,
  "revisao" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PropostaComercial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PropostaComercial_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PropostaComercial_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PropostaComercial_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PropostaComercial_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PropostaComercial_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PropostaComercial_propostaOrigemId_fkey" FOREIGN KEY ("propostaOrigemId") REFERENCES "PropostaComercial" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ItemPropostaComercial" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "propostaId" INTEGER NOT NULL,
  "descricao" TEXT NOT NULL,
  "quantidade" DECIMAL NOT NULL,
  "valorUnitarioCentavos" INTEGER NOT NULL,
  "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
  "subtotalCentavos" INTEGER NOT NULL,
  "totalCentavos" INTEGER NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ItemPropostaComercial_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "PropostaComercial" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "HistoricoPropostaComercial" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "empresaId" INTEGER NOT NULL,
  "propostaId" INTEGER NOT NULL,
  "autorId" INTEGER NOT NULL,
  "acao" TEXT NOT NULL,
  "statusAnterior" TEXT,
  "statusNovo" TEXT,
  "versao" INTEGER NOT NULL,
  "observacao" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HistoricoPropostaComercial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HistoricoPropostaComercial_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "PropostaComercial" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HistoricoPropostaComercial_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PropostaComercial_empresaId_codigo_key" ON "PropostaComercial"("empresaId", "codigo");
CREATE UNIQUE INDEX "PropostaComercial_empresaId_propostaOrigemId_versao_key" ON "PropostaComercial"("empresaId", "propostaOrigemId", "versao");
CREATE INDEX "PropostaComercial_empresaId_clienteId_status_idx" ON "PropostaComercial"("empresaId", "clienteId", "status");
CREATE INDEX "PropostaComercial_empresaId_negocioId_status_idx" ON "PropostaComercial"("empresaId", "negocioId", "status");
CREATE INDEX "PropostaComercial_empresaId_leadId_status_idx" ON "PropostaComercial"("empresaId", "leadId", "status");
CREATE INDEX "PropostaComercial_empresaId_responsavelId_status_idx" ON "PropostaComercial"("empresaId", "responsavelId", "status");
CREATE INDEX "ItemPropostaComercial_propostaId_ordem_idx" ON "ItemPropostaComercial"("propostaId", "ordem");
CREATE INDEX "HistoricoPropostaComercial_empresaId_propostaId_createdAt_idx" ON "HistoricoPropostaComercial"("empresaId", "propostaId", "createdAt");
CREATE INDEX "HistoricoPropostaComercial_empresaId_autorId_createdAt_idx" ON "HistoricoPropostaComercial"("empresaId", "autorId", "createdAt");
