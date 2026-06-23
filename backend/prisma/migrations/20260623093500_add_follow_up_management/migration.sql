-- CreateTable
CREATE TABLE "Acompanhamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clienteId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "dataHora" DATETIME NOT NULL,
    "prioridade" TEXT NOT NULL DEFAULT 'MEDIA',
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "tipo" TEXT NOT NULL DEFAULT 'LIGACAO',
    "responsavel" TEXT,
    "concluidoEm" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Acompanhamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Acompanhamento_clienteId_idx" ON "Acompanhamento"("clienteId");

-- CreateIndex
CREATE INDEX "Acompanhamento_dataHora_idx" ON "Acompanhamento"("dataHora");

-- CreateIndex
CREATE INDEX "Acompanhamento_status_idx" ON "Acompanhamento"("status");

-- CreateIndex
CREATE INDEX "Acompanhamento_prioridade_idx" ON "Acompanhamento"("prioridade");

-- CreateIndex
CREATE INDEX "Acompanhamento_tipo_idx" ON "Acompanhamento"("tipo");
