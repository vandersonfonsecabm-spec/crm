-- CreateTable
CREATE TABLE "IntegracaoOAuthState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "provedor" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegracaoOAuthState_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IntegracaoOAuthState_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoOAuthState_stateHash_key" ON "IntegracaoOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "IntegracaoOAuthState_empresaId_idx" ON "IntegracaoOAuthState"("empresaId");

-- CreateIndex
CREATE INDEX "IntegracaoOAuthState_usuarioId_idx" ON "IntegracaoOAuthState"("usuarioId");

-- CreateIndex
CREATE INDEX "IntegracaoOAuthState_provedor_idx" ON "IntegracaoOAuthState"("provedor");

-- CreateIndex
CREATE INDEX "IntegracaoOAuthState_expiresAt_idx" ON "IntegracaoOAuthState"("expiresAt");