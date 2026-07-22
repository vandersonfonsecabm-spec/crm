PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Acompanhamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "clienteId" INTEGER,
    "leadId" INTEGER,
    "conversaCanalId" INTEGER,
    "negocioId" INTEGER,
    "propostaComercialId" INTEGER,
    "responsavelId" INTEGER,
    "autorId" INTEGER,
    "concluidoPorId" INTEGER,
    "canceladoPorId" INTEGER,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "dataHora" DATETIME NOT NULL,
    "prioridade" TEXT NOT NULL DEFAULT 'MEDIA',
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "tipo" TEXT NOT NULL DEFAULT 'LIGACAO',
    "responsavel" TEXT,
    "concluidoEm" DATETIME,
    "canceladoEm" DATETIME,
    "revisao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Acompanhamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Acompanhamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Acompanhamento_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Acompanhamento_conversaCanalId_fkey" FOREIGN KEY ("conversaCanalId") REFERENCES "ConversaCanal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Acompanhamento_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Acompanhamento_propostaComercialId_fkey" FOREIGN KEY ("propostaComercialId") REFERENCES "PropostaComercial" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Acompanhamento_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Acompanhamento_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Acompanhamento_concluidoPorId_fkey" FOREIGN KEY ("concluidoPorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Acompanhamento_canceladoPorId_fkey" FOREIGN KEY ("canceladoPorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Acompanhamento" (
    "id", "empresaId", "clienteId", "leadId", "conversaCanalId", "negocioId",
    "titulo", "descricao", "dataHora", "prioridade", "status", "tipo",
    "responsavel", "concluidoEm", "createdAt", "updatedAt"
)
SELECT
    "id", "empresaId", "clienteId", "leadId", "conversaCanalId", "negocioId",
    "titulo", "descricao", "dataHora", "prioridade", "status", "tipo",
    "responsavel", "concluidoEm", "createdAt", "updatedAt"
FROM "Acompanhamento";

DROP TABLE "Acompanhamento";
ALTER TABLE "new_Acompanhamento" RENAME TO "Acompanhamento";

CREATE INDEX "Acompanhamento_empresaId_idx" ON "Acompanhamento"("empresaId");
CREATE INDEX "Acompanhamento_clienteId_idx" ON "Acompanhamento"("clienteId");
CREATE INDEX "Acompanhamento_empresaId_clienteId_idx" ON "Acompanhamento"("empresaId", "clienteId");
CREATE INDEX "Acompanhamento_empresaId_dataHora_idx" ON "Acompanhamento"("empresaId", "dataHora");
CREATE INDEX "Acompanhamento_empresaId_status_idx" ON "Acompanhamento"("empresaId", "status");
CREATE INDEX "Acompanhamento_empresaId_prioridade_idx" ON "Acompanhamento"("empresaId", "prioridade");
CREATE INDEX "Acompanhamento_empresaId_tipo_idx" ON "Acompanhamento"("empresaId", "tipo");
CREATE INDEX "Acompanhamento_empresaId_leadId_idx" ON "Acompanhamento"("empresaId", "leadId");
CREATE INDEX "Acompanhamento_empresaId_conversaCanalId_idx" ON "Acompanhamento"("empresaId", "conversaCanalId");
CREATE INDEX "Acompanhamento_empresaId_negocioId_idx" ON "Acompanhamento"("empresaId", "negocioId");
CREATE INDEX "Acompanhamento_empresaId_propostaComercialId_idx" ON "Acompanhamento"("empresaId", "propostaComercialId");
CREATE INDEX "Acompanhamento_empresaId_responsavelId_status_idx" ON "Acompanhamento"("empresaId", "responsavelId", "status");
CREATE INDEX "Acompanhamento_empresaId_autorId_createdAt_idx" ON "Acompanhamento"("empresaId", "autorId", "createdAt");

CREATE TABLE "HistoricoAcompanhamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "acompanhamentoId" INTEGER NOT NULL,
    "autorId" INTEGER NOT NULL,
    "acao" TEXT NOT NULL,
    "statusAnterior" TEXT,
    "statusNovo" TEXT,
    "responsavelAnteriorId" INTEGER,
    "responsavelNovoId" INTEGER,
    "dataHoraAnterior" DATETIME,
    "dataHoraNova" DATETIME,
    "observacao" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricoAcompanhamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HistoricoAcompanhamento_acompanhamentoId_fkey" FOREIGN KEY ("acompanhamentoId") REFERENCES "Acompanhamento" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HistoricoAcompanhamento_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HistoricoAcompanhamento_responsavelAnteriorId_fkey" FOREIGN KEY ("responsavelAnteriorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HistoricoAcompanhamento_responsavelNovoId_fkey" FOREIGN KEY ("responsavelNovoId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "HistoricoAcompanhamento_empresaId_acompanhamentoId_createdAt_idx" ON "HistoricoAcompanhamento"("empresaId", "acompanhamentoId", "createdAt");
CREATE INDEX "HistoricoAcompanhamento_empresaId_autorId_createdAt_idx" ON "HistoricoAcompanhamento"("empresaId", "autorId", "createdAt");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
