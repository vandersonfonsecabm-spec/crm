PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_IntegracaoOAuthState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "canalIntegracaoId" INTEGER,
    "provedor" TEXT NOT NULL,
    "fluxo" TEXT,
    "stateHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegracaoOAuthState_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IntegracaoOAuthState_empresaId_usuarioId_fkey" FOREIGN KEY ("empresaId", "usuarioId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "IntegracaoOAuthState_empresaId_canalIntegracaoId_fkey" FOREIGN KEY ("empresaId", "canalIntegracaoId") REFERENCES "CanalIntegracao" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);

INSERT INTO "new_IntegracaoOAuthState" ("createdAt", "empresaId", "expiresAt", "id", "provedor", "stateHash", "usedAt", "usuarioId")
SELECT "createdAt", "empresaId", "expiresAt", "id", "provedor", "stateHash", "usedAt", "usuarioId"
FROM "IntegracaoOAuthState";

DROP TABLE "IntegracaoOAuthState";
ALTER TABLE "new_IntegracaoOAuthState" RENAME TO "IntegracaoOAuthState";

CREATE UNIQUE INDEX "IntegracaoOAuthState_stateHash_key" ON "IntegracaoOAuthState"("stateHash");
CREATE INDEX "IntegracaoOAuthState_empresaId_idx" ON "IntegracaoOAuthState"("empresaId");
CREATE INDEX "IntegracaoOAuthState_usuarioId_idx" ON "IntegracaoOAuthState"("usuarioId");
CREATE INDEX "IntegracaoOAuthState_empresaId_canalIntegracaoId_fluxo_idx" ON "IntegracaoOAuthState"("empresaId", "canalIntegracaoId", "fluxo");
CREATE INDEX "IntegracaoOAuthState_provedor_idx" ON "IntegracaoOAuthState"("provedor");
CREATE INDEX "IntegracaoOAuthState_expiresAt_idx" ON "IntegracaoOAuthState"("expiresAt");

PRAGMA foreign_keys=ON;
