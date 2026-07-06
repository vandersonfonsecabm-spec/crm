PRAGMA foreign_keys=OFF;

-- Require exactly one Empresa only when commercial legacy rows need tenant assignment.
CREATE TABLE "_CommercialScopeEmpresa" (
    "id" INTEGER
);

CREATE TABLE "_CommercialScopeEmpresaRequired" (
    "id" INTEGER NOT NULL
);

INSERT INTO "_CommercialScopeEmpresa" ("id")
VALUES ((SELECT CASE WHEN COUNT(*) = 1 THEN MIN("id") ELSE NULL END FROM "Empresa"));

INSERT INTO "_CommercialScopeEmpresaRequired" ("id")
SELECT "id"
FROM "_CommercialScopeEmpresa"
WHERE (SELECT COUNT(*) FROM "Cliente") > 0
   OR (SELECT COUNT(*) FROM "Nota") > 0
   OR (SELECT COUNT(*) FROM "Acompanhamento") > 0;

-- Recreate Cliente with empresaId while preserving every legacy field, ID and timestamp.
CREATE TABLE "new_Cliente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "empresa" TEXT NOT NULL DEFAULT '',
    "interesse" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Lead',
    "valor" INTEGER NOT NULL DEFAULT 0,
    "origem" TEXT NOT NULL DEFAULT 'Manual',
    "favorito" BOOLEAN NOT NULL DEFAULT false,
    "quente" BOOLEAN NOT NULL DEFAULT false,
    "ultimoContato" INTEGER NOT NULL DEFAULT 0,
    "proximoFollowUp" TEXT NOT NULL DEFAULT 'Hoje',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Cliente" (
    "id",
    "empresaId",
    "nome",
    "telefone",
    "email",
    "empresa",
    "interesse",
    "status",
    "valor",
    "origem",
    "favorito",
    "quente",
    "ultimoContato",
    "proximoFollowUp",
    "tags",
    "createdAt"
)
SELECT
    "id",
    (SELECT "id" FROM "_CommercialScopeEmpresa"),
    "nome",
    "telefone",
    "email",
    "empresa",
    "interesse",
    "status",
    "valor",
    "origem",
    "favorito",
    "quente",
    "ultimoContato",
    "proximoFollowUp",
    "tags",
    "createdAt"
FROM "Cliente";

DROP TABLE "Cliente";
ALTER TABLE "new_Cliente" RENAME TO "Cliente";

CREATE INDEX "Cliente_empresaId_idx" ON "Cliente"("empresaId");
CREATE INDEX "Cliente_empresaId_status_idx" ON "Cliente"("empresaId", "status");
CREATE INDEX "Cliente_empresaId_quente_idx" ON "Cliente"("empresaId", "quente");
CREATE INDEX "Cliente_empresaId_createdAt_idx" ON "Cliente"("empresaId", "createdAt");

-- Recreate Nota with empresaId inherited from its Cliente.
CREATE TABLE "new_Nota" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'nota',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clienteId" INTEGER NOT NULL,
    CONSTRAINT "Nota_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Nota_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Nota" (
    "id",
    "empresaId",
    "texto",
    "tipo",
    "createdAt",
    "clienteId"
)
SELECT
    n."id",
    (SELECT c."empresaId" FROM "Cliente" c WHERE c."id" = n."clienteId"),
    n."texto",
    n."tipo",
    n."createdAt",
    n."clienteId"
FROM "Nota" n;

DROP TABLE "Nota";
ALTER TABLE "new_Nota" RENAME TO "Nota";

CREATE INDEX "Nota_empresaId_idx" ON "Nota"("empresaId");
CREATE INDEX "Nota_clienteId_idx" ON "Nota"("clienteId");
CREATE INDEX "Nota_empresaId_clienteId_idx" ON "Nota"("empresaId", "clienteId");
CREATE INDEX "Nota_empresaId_createdAt_idx" ON "Nota"("empresaId", "createdAt");

-- Recreate Acompanhamento with empresaId inherited from its Cliente.
CREATE TABLE "new_Acompanhamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
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
    CONSTRAINT "Acompanhamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Acompanhamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Acompanhamento" (
    "id",
    "empresaId",
    "clienteId",
    "titulo",
    "descricao",
    "dataHora",
    "prioridade",
    "status",
    "tipo",
    "responsavel",
    "concluidoEm",
    "createdAt",
    "updatedAt"
)
SELECT
    a."id",
    (SELECT c."empresaId" FROM "Cliente" c WHERE c."id" = a."clienteId"),
    a."clienteId",
    a."titulo",
    a."descricao",
    a."dataHora",
    a."prioridade",
    a."status",
    a."tipo",
    a."responsavel",
    a."concluidoEm",
    a."createdAt",
    a."updatedAt"
FROM "Acompanhamento" a;

DROP TABLE "Acompanhamento";
ALTER TABLE "new_Acompanhamento" RENAME TO "Acompanhamento";

CREATE INDEX "Acompanhamento_empresaId_idx" ON "Acompanhamento"("empresaId");
CREATE INDEX "Acompanhamento_clienteId_idx" ON "Acompanhamento"("clienteId");
CREATE INDEX "Acompanhamento_empresaId_clienteId_idx" ON "Acompanhamento"("empresaId", "clienteId");
CREATE INDEX "Acompanhamento_empresaId_dataHora_idx" ON "Acompanhamento"("empresaId", "dataHora");
CREATE INDEX "Acompanhamento_empresaId_status_idx" ON "Acompanhamento"("empresaId", "status");
CREATE INDEX "Acompanhamento_empresaId_prioridade_idx" ON "Acompanhamento"("empresaId", "prioridade");
CREATE INDEX "Acompanhamento_empresaId_tipo_idx" ON "Acompanhamento"("empresaId", "tipo");

DROP TABLE "_CommercialScopeEmpresaRequired";
DROP TABLE "_CommercialScopeEmpresa";

PRAGMA foreign_keys=ON;
