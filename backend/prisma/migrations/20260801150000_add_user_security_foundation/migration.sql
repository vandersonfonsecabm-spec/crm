-- CreateTable
CREATE TABLE "SessaoUsuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "familyId" TEXT NOT NULL,
    "userAgentSanitizado" TEXT,
    "ipHash" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUsoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" DATETIME NOT NULL,
    "revogadoEm" DATETIME,
    "motivoRevogacao" TEXT,
    CONSTRAINT "SessaoUsuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessaoUsuario_empresaId_usuarioId_fkey" FOREIGN KEY ("empresaId", "usuarioId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE TABLE "SessaoRefreshToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" INTEGER NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "emitidoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usadoEm" DATETIME,
    "revogadoEm" DATETIME,
    "expiraEm" DATETIME NOT NULL,
    CONSTRAINT "SessaoRefreshToken_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessaoRefreshToken_empresaId_sessaoId_fkey" FOREIGN KEY ("empresaId", "sessaoId") REFERENCES "SessaoUsuario" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE TABLE "TokenRecuperacaoSenha" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" DATETIME NOT NULL,
    "usadoEm" DATETIME,
    "revogadoEm" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenRecuperacaoSenha_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TokenRecuperacaoSenha_empresaId_usuarioId_fkey" FOREIGN KEY ("empresaId", "usuarioId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE TABLE "ConviteUsuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" INTEGER NOT NULL,
    "convidadoPorId" INTEGER NOT NULL,
    "nomeConvidado" TEXT NOT NULL,
    "emailNormalizado" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'VENDEDOR',
    "tokenHash" TEXT NOT NULL,
    "expiraEm" DATETIME NOT NULL,
    "aceitoEm" DATETIME,
    "revogadoEm" DATETIME,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING_DELIVERY',
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConviteUsuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConviteUsuario_empresaId_convidadoPorId_fkey" FOREIGN KEY ("empresaId", "convidadoPorId") REFERENCES "Usuario" ("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE "AuditoriaSeguranca" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empresaId" INTEGER NOT NULL,
    "actorUsuarioId" INTEGER,
    "targetUsuarioId" INTEGER,
    "acao" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "correlationId" TEXT,
    "motivo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditoriaSeguranca_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SessaoUsuario_empresaId_usuarioId_revogadoEm_idx" ON "SessaoUsuario"("empresaId", "usuarioId", "revogadoEm");
CREATE INDEX "SessaoUsuario_empresaId_expiraEm_idx" ON "SessaoUsuario"("empresaId", "expiraEm");
CREATE INDEX "SessaoUsuario_familyId_idx" ON "SessaoUsuario"("familyId");
CREATE UNIQUE INDEX "SessaoUsuario_empresaId_id_key" ON "SessaoUsuario"("empresaId", "id");
CREATE UNIQUE INDEX "SessaoRefreshToken_tokenHash_key" ON "SessaoRefreshToken"("tokenHash");
CREATE INDEX "SessaoRefreshToken_empresaId_sessaoId_idx" ON "SessaoRefreshToken"("empresaId", "sessaoId");
CREATE INDEX "SessaoRefreshToken_empresaId_expiraEm_idx" ON "SessaoRefreshToken"("empresaId", "expiraEm");
CREATE UNIQUE INDEX "SessaoRefreshToken_empresaId_id_key" ON "SessaoRefreshToken"("empresaId", "id");
CREATE UNIQUE INDEX "TokenRecuperacaoSenha_tokenHash_key" ON "TokenRecuperacaoSenha"("tokenHash");
CREATE INDEX "TokenRecuperacaoSenha_empresaId_usuarioId_expiraEm_idx" ON "TokenRecuperacaoSenha"("empresaId", "usuarioId", "expiraEm");
CREATE UNIQUE INDEX "TokenRecuperacaoSenha_empresaId_id_key" ON "TokenRecuperacaoSenha"("empresaId", "id");
CREATE UNIQUE INDEX "ConviteUsuario_tokenHash_key" ON "ConviteUsuario"("tokenHash");
CREATE INDEX "ConviteUsuario_empresaId_expiraEm_idx" ON "ConviteUsuario"("empresaId", "expiraEm");
CREATE INDEX "ConviteUsuario_empresaId_aceitoEm_revogadoEm_idx" ON "ConviteUsuario"("empresaId", "aceitoEm", "revogadoEm");
CREATE UNIQUE INDEX "ConviteUsuario_empresaId_id_key" ON "ConviteUsuario"("empresaId", "id");
CREATE UNIQUE INDEX "ConviteUsuario_empresaId_emailNormalizado_key" ON "ConviteUsuario"("empresaId", "emailNormalizado");
CREATE INDEX "AuditoriaSeguranca_empresaId_createdAt_idx" ON "AuditoriaSeguranca"("empresaId", "createdAt");
CREATE INDEX "AuditoriaSeguranca_empresaId_actorUsuarioId_createdAt_idx" ON "AuditoriaSeguranca"("empresaId", "actorUsuarioId", "createdAt");
CREATE INDEX "AuditoriaSeguranca_empresaId_targetUsuarioId_createdAt_idx" ON "AuditoriaSeguranca"("empresaId", "targetUsuarioId", "createdAt");
CREATE INDEX "AuditoriaSeguranca_empresaId_acao_createdAt_idx" ON "AuditoriaSeguranca"("empresaId", "acao", "createdAt");
