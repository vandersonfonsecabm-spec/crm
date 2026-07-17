-- CreateTable
CREATE TABLE "EmpresaFuncionalidade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "chave" TEXT NOT NULL,
    "habilitada" BOOLEAN NOT NULL DEFAULT false,
    "habilitadoEm" DATETIME,
    "habilitadoPorUsuarioId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmpresaFuncionalidade_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmpresaFuncionalidade_habilitadoPorUsuarioId_fkey" FOREIGN KEY ("habilitadoPorUsuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditoriaFuncionalidade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "funcionalidadeId" INTEGER,
    "chave" TEXT NOT NULL,
    "valorAnterior" BOOLEAN,
    "valorNovo" BOOLEAN NOT NULL,
    "operadoPor" TEXT NOT NULL,
    "usuarioId" INTEGER,
    "motivo" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditoriaFuncionalidade_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditoriaFuncionalidade_funcionalidadeId_fkey" FOREIGN KEY ("funcionalidadeId") REFERENCES "EmpresaFuncionalidade" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditoriaFuncionalidade_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaFuncionalidade_empresaId_chave_key" ON "EmpresaFuncionalidade"("empresaId", "chave");
CREATE INDEX "EmpresaFuncionalidade_empresaId_habilitada_idx" ON "EmpresaFuncionalidade"("empresaId", "habilitada");
CREATE INDEX "EmpresaFuncionalidade_habilitadoPorUsuarioId_idx" ON "EmpresaFuncionalidade"("habilitadoPorUsuarioId");
CREATE INDEX "AuditoriaFuncionalidade_empresaId_chave_createdAt_idx" ON "AuditoriaFuncionalidade"("empresaId", "chave", "createdAt");
CREATE INDEX "AuditoriaFuncionalidade_funcionalidadeId_createdAt_idx" ON "AuditoriaFuncionalidade"("funcionalidadeId", "createdAt");
CREATE INDEX "AuditoriaFuncionalidade_usuarioId_createdAt_idx" ON "AuditoriaFuncionalidade"("usuarioId", "createdAt");
