CREATE TABLE "SessaoUsuario" (
    "id" TEXT NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "familyId" TEXT NOT NULL,
    "userAgentSanitizado" TEXT,
    "ipHash" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUsoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "revogadoEm" TIMESTAMP(3),
    "motivoRevogacao" TEXT,
    CONSTRAINT "SessaoUsuario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessaoRefreshToken" (
    "id" TEXT NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "emitidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usadoEm" TIMESTAMP(3),
    "revogadoEm" TIMESTAMP(3),
    "expiraEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SessaoRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TokenRecuperacaoSenha" (
    "id" TEXT NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "revogadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenRecuperacaoSenha_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConviteUsuario" (
    "id" TEXT NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "convidadoPorId" INTEGER NOT NULL,
    "nomeConvidado" TEXT NOT NULL,
    "emailNormalizado" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL DEFAULT 'VENDEDOR',
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "aceitoEm" TIMESTAMP(3),
    "revogadoEm" TIMESTAMP(3),
    "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING_DELIVERY',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConviteUsuario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditoriaSeguranca" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "actorUsuarioId" INTEGER,
    "targetUsuarioId" INTEGER,
    "acao" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "correlationId" TEXT,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditoriaSeguranca_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessaoUsuario_empresaId_id_key" ON "SessaoUsuario"("empresaId", "id");
CREATE INDEX "SessaoUsuario_empresaId_usuarioId_revogadoEm_idx" ON "SessaoUsuario"("empresaId", "usuarioId", "revogadoEm");
CREATE INDEX "SessaoUsuario_empresaId_expiraEm_idx" ON "SessaoUsuario"("empresaId", "expiraEm");
CREATE INDEX "SessaoUsuario_familyId_idx" ON "SessaoUsuario"("familyId");
CREATE UNIQUE INDEX "SessaoRefreshToken_tokenHash_key" ON "SessaoRefreshToken"("tokenHash");
CREATE UNIQUE INDEX "SessaoRefreshToken_empresaId_id_key" ON "SessaoRefreshToken"("empresaId", "id");
CREATE INDEX "SessaoRefreshToken_empresaId_sessaoId_idx" ON "SessaoRefreshToken"("empresaId", "sessaoId");
CREATE INDEX "SessaoRefreshToken_empresaId_expiraEm_idx" ON "SessaoRefreshToken"("empresaId", "expiraEm");
CREATE UNIQUE INDEX "TokenRecuperacaoSenha_tokenHash_key" ON "TokenRecuperacaoSenha"("tokenHash");
CREATE UNIQUE INDEX "TokenRecuperacaoSenha_empresaId_id_key" ON "TokenRecuperacaoSenha"("empresaId", "id");
CREATE INDEX "TokenRecuperacaoSenha_empresaId_usuarioId_expiraEm_idx" ON "TokenRecuperacaoSenha"("empresaId", "usuarioId", "expiraEm");
CREATE UNIQUE INDEX "ConviteUsuario_tokenHash_key" ON "ConviteUsuario"("tokenHash");
CREATE UNIQUE INDEX "ConviteUsuario_empresaId_id_key" ON "ConviteUsuario"("empresaId", "id");
CREATE UNIQUE INDEX "ConviteUsuario_empresaId_emailNormalizado_key" ON "ConviteUsuario"("empresaId", "emailNormalizado");
CREATE INDEX "ConviteUsuario_empresaId_expiraEm_idx" ON "ConviteUsuario"("empresaId", "expiraEm");
CREATE INDEX "ConviteUsuario_empresaId_aceitoEm_revogadoEm_idx" ON "ConviteUsuario"("empresaId", "aceitoEm", "revogadoEm");
CREATE INDEX "AuditoriaSeguranca_empresaId_createdAt_idx" ON "AuditoriaSeguranca"("empresaId", "createdAt");
CREATE INDEX "AuditoriaSeguranca_empresaId_actorUsuarioId_createdAt_idx" ON "AuditoriaSeguranca"("empresaId", "actorUsuarioId", "createdAt");
CREATE INDEX "AuditoriaSeguranca_empresaId_targetUsuarioId_createdAt_idx" ON "AuditoriaSeguranca"("empresaId", "targetUsuarioId", "createdAt");
CREATE INDEX "AuditoriaSeguranca_empresaId_acao_createdAt_idx" ON "AuditoriaSeguranca"("empresaId", "acao", "createdAt");

ALTER TABLE "SessaoUsuario" ADD CONSTRAINT "SessaoUsuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessaoUsuario" ADD CONSTRAINT "SessaoUsuario_empresaId_usuarioId_fkey" FOREIGN KEY ("empresaId", "usuarioId") REFERENCES "Usuario"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "SessaoRefreshToken" ADD CONSTRAINT "SessaoRefreshToken_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessaoRefreshToken" ADD CONSTRAINT "SessaoRefreshToken_empresaId_sessaoId_fkey" FOREIGN KEY ("empresaId", "sessaoId") REFERENCES "SessaoUsuario"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "TokenRecuperacaoSenha" ADD CONSTRAINT "TokenRecuperacaoSenha_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TokenRecuperacaoSenha" ADD CONSTRAINT "TokenRecuperacaoSenha_empresaId_usuarioId_fkey" FOREIGN KEY ("empresaId", "usuarioId") REFERENCES "Usuario"("empresaId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "ConviteUsuario" ADD CONSTRAINT "ConviteUsuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConviteUsuario" ADD CONSTRAINT "ConviteUsuario_empresaId_convidadoPorId_fkey" FOREIGN KEY ("empresaId", "convidadoPorId") REFERENCES "Usuario"("empresaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AuditoriaSeguranca" ADD CONSTRAINT "AuditoriaSeguranca_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
