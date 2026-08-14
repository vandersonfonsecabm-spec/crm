const crypto = require("node:crypto");
const { createAuthRateLimiter, requestIp } = require("./auth-rate-limiter");
const { SYSTEM_ACTOR_EMAIL, isSystemActor } = require("./system-actor");

const MAX_REASON_LENGTH = 240;
const MAX_USER_AGENT_LENGTH = 180;
const REFRESH_COOKIE_NAME = "crm_refresh_token";
const DEFAULT_REFRESH_DAYS = 30;
const DEFAULT_RESET_MINUTES = 30;
const DEFAULT_INVITE_HOURS = 72;
const PASSWORD_MIN_LENGTH = 12;
const COMMON_PASSWORDS = new Set([
  "123456789012",
  "password1234",
  "senha12345678",
  "qwerty123456",
  "admin1234567",
]);

function createUserSecurity({
  prisma,
  jwt,
  bcrypt,
  config,
  production = process.env.NODE_ENV === "production",
  reservedPlatformEmails = new Set(),
  securityDelivery,
}) {
  const refreshDays = positiveNumber(process.env.AUTH_REFRESH_DAYS, DEFAULT_REFRESH_DAYS);
  const resetMinutes = positiveNumber(process.env.AUTH_RESET_MINUTES, DEFAULT_RESET_MINUTES);
  const inviteHours = positiveNumber(process.env.AUTH_INVITE_HOURS, DEFAULT_INVITE_HOURS);
  const delivery = securityDelivery;
  const sensitiveRateLimiter = createAuthRateLimiter({ identityLimit: 8, ipLimit: 40 });

  async function createLoginSession({ usuario, expectedPasswordHash = usuario?.senhaHash, req }) {
    if (isSystemActor(usuario)) throw securityError("SYSTEM_ACTOR_RESERVED", 403);
    const now = new Date();
    const sessionId = crypto.randomUUID();
    const familyId = crypto.randomUUID();
    const rawRefreshToken = randomToken();
    const expiraEm = addMilliseconds(now, refreshDays * 24 * 60 * 60 * 1000);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const activeUser = await prisma.$transaction(async (tx) => {
          const changed = await tx.usuario.updateMany({
            where: {
              id: usuario.id,
              empresaId: usuario.empresaId,
              ativo: true,
              senhaHash: expectedPasswordHash,
              empresa: { ativo: true },
            },
            data: { ultimoLoginEm: now },
          });
          if (changed.count !== 1) throw securityError("AUTH_CREDENTIAL_CHANGED", 401);
          const currentUser = await tx.usuario.findFirst({
            where: { id: usuario.id, empresaId: usuario.empresaId, ativo: true, empresa: { ativo: true } },
            include: { empresa: true },
          });
          if (!currentUser) throw securityError("ACCOUNT_INACTIVE", 403);
          await tx.sessaoUsuario.create({
            data: {
              id: sessionId,
              empresaId: usuario.empresaId,
              usuarioId: usuario.id,
              familyId,
              userAgentSanitizado: sanitizeUserAgent(req?.headers?.["user-agent"]),
              ipHash: hashIp(req),
              expiraEm,
            },
          });
          await tx.sessaoRefreshToken.create({
            data: {
              empresaId: usuario.empresaId,
              sessaoId: sessionId,
              tokenHash: hashToken(rawRefreshToken),
              expiraEm,
            },
          });
          return currentUser;
        }, { isolationLevel: "Serializable" });

        return buildSessionTokens({ usuario: activeUser, sessionId, rawRefreshToken, config });
      } catch (error) {
        if (!isRetryableConflict(error) || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
      }
    }
    throw securityError("AUTH_LOGIN_CONFLICT", 409);
  }

  async function validateAccessSession({ sessionId, empresaId, usuarioId }) {
    if (!sessionId) return { valid: true, legacy: true };
    const session = await prisma.sessaoUsuario.findFirst({
      where: { id: sessionId, empresaId, usuarioId },
      select: { id: true, revogadoEm: true, expiraEm: true },
    });
    if (!session || session.revogadoEm || session.expiraEm <= new Date()) return { valid: false };
    return { valid: true, legacy: false };
  }

  async function refreshSession({ rawRefreshToken, req }) {
    const tokenHash = hashToken(rawRefreshToken || "");
    if (!tokenHash) throw securityError("AUTH_REFRESH_INVALID", 401);

    const current = await prisma.sessaoRefreshToken.findUnique({
      where: { tokenHash },
      include: { sessao: true },
    });
    if (!current) throw securityError("AUTH_REFRESH_INVALID", 401);

    const now = new Date();
    if (current.usadoEm || current.revogadoEm || current.expiraEm <= now || current.sessao.revogadoEm || current.sessao.expiraEm <= now) {
      await revokeFamily(current.sessao.empresaId, current.sessao.familyId, "REFRESH_REUSE_DETECTED");
      throw securityError("AUTH_REFRESH_REUSED", 401);
    }

    const usuario = await prisma.usuario.findFirst({
      where: { id: current.sessao.usuarioId, empresaId: current.sessao.empresaId },
      include: { empresa: true },
    });
    if (!usuario || !usuario.ativo || !usuario.empresa.ativo) {
      await revokeSession(current.sessao.empresaId, current.sessao.id, "ACCOUNT_INACTIVE");
      throw securityError("AUTH_REFRESH_INVALID", 401);
    }
    if (isSystemActor(usuario)) {
      await revokeSession(current.sessao.empresaId, current.sessao.id, "SYSTEM_ACTOR_RESERVED");
      throw securityError("SYSTEM_ACTOR_RESERVED", 403);
    }

    const nextRawToken = randomToken();
    const nextExpiresAt = current.sessao.expiraEm;
    try {
      await prisma.$transaction(async (tx) => {
        const consumed = await tx.sessaoRefreshToken.updateMany({
          where: { id: current.id, empresaId: current.empresaId, usadoEm: null, revogadoEm: null },
          data: { usadoEm: now },
        });
        if (consumed.count !== 1) throw securityError("AUTH_REFRESH_REUSED", 401);

        await tx.sessaoRefreshToken.create({
          data: {
            empresaId: current.empresaId,
            sessaoId: current.sessao.id,
            tokenHash: hashToken(nextRawToken),
            expiraEm: nextExpiresAt,
          },
        });
        await tx.sessaoUsuario.updateMany({
          where: { id: current.sessao.id, empresaId: current.empresaId, revogadoEm: null },
          data: { ultimoUsoEm: now },
        });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error?.code === "AUTH_REFRESH_REUSED") {
        await revokeFamily(current.sessao.empresaId, current.sessao.familyId, "REFRESH_REUSE_DETECTED");
        throw error;
      }
      if (error?.code === "P2002" || /database is locked|transaction/i.test(String(error?.message || ""))) {
        await revokeFamily(current.sessao.empresaId, current.sessao.familyId, "REFRESH_CONFLICT");
        throw securityError("AUTH_REFRESH_CONFLICT", 409);
      }
      throw error;
    }

    return buildSessionTokens({ usuario, sessionId: current.sessao.id, rawRefreshToken: nextRawToken, config });
  }

  async function revokeSession(empresaId, sessionId, motivo = "USER_REQUEST", usuarioId = null) {
    if (!sessionId) return false;
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const result = await tx.sessaoUsuario.updateMany({
        where: { id: sessionId, empresaId, revogadoEm: null, ...(usuarioId ? { usuarioId } : {}) },
        data: { revogadoEm: now, motivoRevogacao: sanitizeReason(motivo) },
      });
      if (result.count !== 1) return false;
      await tx.sessaoRefreshToken.updateMany({
        where: { empresaId, sessaoId: sessionId, revogadoEm: null },
        data: { revogadoEm: now },
      });
      return true;
    });
  }

  async function revokeFamily(empresaId, familyId, motivo = "REFRESH_REUSE_DETECTED") {
    if (!familyId) return;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const sessions = await tx.sessaoUsuario.findMany({ where: { empresaId, familyId }, select: { id: true } });
      const ids = sessions.map((session) => session.id);
      if (!ids.length) return;
      await tx.sessaoUsuario.updateMany({
        where: { empresaId, id: { in: ids }, revogadoEm: null },
        data: { revogadoEm: now, motivoRevogacao: sanitizeReason(motivo) },
      });
      await tx.sessaoRefreshToken.updateMany({
        where: { empresaId, sessaoId: { in: ids }, revogadoEm: null },
        data: { revogadoEm: now },
      });
    });
  }

  async function revokeAllUserSessions(empresaId, usuarioId, motivo = "USER_REQUEST", exceptSessionId = null) {
    const now = new Date();
    const where = {
      empresaId,
      usuarioId,
      revogadoEm: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    };
    return prisma.$transaction(async (tx) => {
      const sessions = await tx.sessaoUsuario.findMany({ where, select: { id: true } });
      const ids = sessions.map((session) => session.id);
      if (!ids.length) return 0;
      await tx.sessaoUsuario.updateMany({ where: { empresaId, id: { in: ids } }, data: { revogadoEm: now, motivoRevogacao: sanitizeReason(motivo) } });
      await tx.sessaoRefreshToken.updateMany({ where: { empresaId, sessaoId: { in: ids }, revogadoEm: null }, data: { revogadoEm: now } });
      return ids.length;
    });
  }

  async function listSessions(empresaId, usuarioId, currentSessionId = null) {
    const sessions = await prisma.sessaoUsuario.findMany({
      where: { empresaId, usuarioId },
      orderBy: { ultimoUsoEm: "desc" },
      take: 50,
      select: { id: true, userAgentSanitizado: true, criadoEm: true, ultimoUsoEm: true, expiraEm: true, revogadoEm: true },
    });
    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgentSanitizado || "Dispositivo nao identificado",
      createdAt: session.criadoEm,
      lastUsedAt: session.ultimoUsoEm,
      expiresAt: session.expiraEm,
      revokedAt: session.revogadoEm,
      current: session.id === currentSessionId,
      active: !session.revogadoEm && session.expiraEm > new Date(),
    }));
  }

  async function createPasswordReset({ usuario, req }) {
    if (isSystemActor(usuario)) throw securityError("SYSTEM_ACTOR_RESERVED", 409);
    const rawToken = randomToken();
    const expiraEm = addMilliseconds(new Date(), resetMinutes * 60 * 1000);
    await prisma.$transaction(async (tx) => {
      await tx.tokenRecuperacaoSenha.updateMany({
        where: { empresaId: usuario.empresaId, usuarioId: usuario.id, usadoEm: null, revogadoEm: null },
        data: { revogadoEm: new Date() },
      });
      await tx.tokenRecuperacaoSenha.create({
        data: { empresaId: usuario.empresaId, usuarioId: usuario.id, tokenHash: hashToken(rawToken), expiraEm },
      });
      await audit(tx, {
        empresaId: usuario.empresaId,
        actorUsuarioId: null,
        targetUsuarioId: usuario.id,
        acao: "PASSWORD_RECOVERY_REQUESTED",
        resultado: "SUCCESS",
        motivo: "Solicitacao de recuperacao registrada.",
        correlationId: correlationId(req),
      });
    });
    const result = await delivery.deliver({ kind: "PASSWORD_RESET", email: usuario.email, token: rawToken, expiresAt: expiraEm });
    return { status: result.status, expiresAt: expiraEm };
  }

  async function startAdminReset({ empresaId, actorUsuarioId, targetUsuarioId, req }) {
    const usuario = await prisma.usuario.findFirst({ where: { id: targetUsuarioId, empresaId } });
    if (!usuario) return { kind: "not-found" };
    if (isSystemActor(usuario)) return { kind: "reserved" };
    const result = await createPasswordReset({ usuario, req });
    await recordAudit({ empresaId, actorUsuarioId, targetUsuarioId, acao: "ADMIN_PASSWORD_RESET_STARTED", resultado: "SUCCESS", motivo: "Reset administrativo iniciado.", correlationId: correlationId(req) });
    return { kind: "started", ...result };
  }

  async function resetPassword({ rawToken, newPassword, req }) {
    assertPassword(newPassword);
    const tokenHash = hashToken(rawToken || "");
    const now = new Date();
    const token = await prisma.tokenRecuperacaoSenha.findUnique({ where: { tokenHash } });
    if (!token || token.usadoEm || token.revogadoEm || token.expiraEm <= now) throw securityError("PASSWORD_RESET_INVALID", 400);
    const senhaHash = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction(async (tx) => {
      const target = await tx.usuario.findFirst({ where: { id: token.usuarioId, empresaId: token.empresaId }, select: { id: true, email: true, ativo: true } });
      if (isSystemActor(target)) throw securityError("SYSTEM_ACTOR_RESERVED", 409);
      if (!target || !target.ativo) throw securityError("ACCOUNT_INACTIVE", 400);
      const consumed = await tx.tokenRecuperacaoSenha.updateMany({ where: { id: token.id, usadoEm: null, revogadoEm: null }, data: { usadoEm: now } });
      if (consumed.count !== 1) throw securityError("PASSWORD_RESET_INVALID", 400);
      const updated = await tx.usuario.updateMany({ where: { id: token.usuarioId, empresaId: token.empresaId, ativo: true }, data: { senhaHash } });
      if (updated.count !== 1) throw securityError("ACCOUNT_INACTIVE", 400);
      const sessions = await tx.sessaoUsuario.findMany({ where: { empresaId: token.empresaId, usuarioId: token.usuarioId, revogadoEm: null }, select: { id: true } });
      const ids = sessions.map((session) => session.id);
      if (ids.length) {
        await tx.sessaoUsuario.updateMany({ where: { empresaId: token.empresaId, id: { in: ids } }, data: { revogadoEm: now, motivoRevogacao: "PASSWORD_RESET" } });
        await tx.sessaoRefreshToken.updateMany({ where: { empresaId: token.empresaId, sessaoId: { in: ids }, revogadoEm: null }, data: { revogadoEm: now } });
      }
      await audit(tx, { empresaId: token.empresaId, targetUsuarioId: token.usuarioId, acao: "PASSWORD_RESET_COMPLETED", resultado: "SUCCESS", motivo: "Senha redefinida pelo titular do token.", correlationId: correlationId(req) });
    });
  }

  async function createInvite({ empresaId, actorUsuarioId, input, req }) {
    const email = normalizeEmail(input.email);
    const nome = normalizeName(input.nome);
    const papel = normalizeRole(input.papel);
    if (!nome || nome.length > 120 || !isValidEmail(email) || !papel) throw securityError("VALIDATION_ERROR", 400);
    if (reservedPlatformEmails.has(email)) throw securityError("RESERVED_PLATFORM_EMAIL", 409);
    if (email === SYSTEM_ACTOR_EMAIL) throw securityError("SYSTEM_ACTOR_RESERVED", 409);
    const existing = await prisma.usuario.findFirst({ where: { empresaId, email } });
    if (existing) throw securityError("USER_ALREADY_EXISTS", 409);
    const rawToken = randomToken();
    const expiresAt = addMilliseconds(new Date(), inviteHours * 60 * 60 * 1000);
    try {
      const invite = await prisma.$transaction(async (tx) => {
        const existingInvite = await tx.conviteUsuario.findFirst({ where: { empresaId, emailNormalizado: email } });
        const pending = existingInvite && existingInvite.aceitoEm === null && existingInvite.revogadoEm === null
          ? existingInvite
          : null;
        if (pending && pending.expiraEm > new Date()) throw securityError("INVITE_ALREADY_PENDING", 409);
        const data = { empresaId, convidadoPorId: actorUsuarioId, nomeConvidado: nome, emailNormalizado: email, papel, tokenHash: hashToken(rawToken), expiraEm: expiresAt, aceitoEm: null, revogadoEm: null, deliveryStatus: "PENDING_DELIVERY" };
        const inviteRecord = existingInvite
          ? await tx.conviteUsuario.update({ where: { id: existingInvite.id }, data })
          : await tx.conviteUsuario.create({ data });
        await audit(tx, { empresaId, actorUsuarioId, acao: pending ? "USER_INVITE_RESENT" : "USER_INVITE_CREATED", resultado: "SUCCESS", motivo: "Convite de usuario registrado.", correlationId: correlationId(req) });
        return inviteRecord;
      });
      const deliveryResult = await delivery.deliver({ kind: "USER_INVITE", email, token: rawToken, expiresAt });
      await prisma.conviteUsuario.updateMany({ where: { id: invite.id, empresaId }, data: { deliveryStatus: deliveryResult.status } });
      return { kind: "created", invite: publicInvite(invite, deliveryResult.status) };
    } catch (error) {
      if (error?.code === "P2002") throw securityError("INVITE_ALREADY_PENDING", 409);
      throw error;
    }
  }

  async function acceptInvite({ rawToken, nome, newPassword, req }) {
    assertPassword(newPassword);
    const presentedTokenHash = hashToken(rawToken || "");
    const token = await prisma.conviteUsuario.findUnique({ where: { tokenHash: presentedTokenHash } });
    if (!token || token.aceitoEm || token.revogadoEm || token.expiraEm <= new Date()) throw securityError("INVITE_INVALID", 400);
    const finalName = normalizeName(nome) || token.nomeConvidado;
    if (!finalName) throw securityError("VALIDATION_ERROR", 400);
    if (process.env.NODE_ENV === "test" && typeof globalThis.__CRM_TEST_SECURITY_AFTER_INVITE_READ === "function") {
      await globalThis.__CRM_TEST_SECURITY_AFTER_INVITE_READ({ inviteId: token.id, empresaId: token.empresaId });
    }
    const senhaHash = await bcrypt.hash(newPassword, 12);
    let usuario;
    try {
      usuario = await prisma.$transaction(async (tx) => {
        const acceptedAt = new Date();
        const accepted = await tx.conviteUsuario.updateMany({
          where: {
            id: token.id,
            empresaId: token.empresaId,
            tokenHash: presentedTokenHash,
            expiraEm: { gt: acceptedAt },
            aceitoEm: null,
            revogadoEm: null,
          },
          data: { aceitoEm: acceptedAt },
        });
        if (accepted.count !== 1) throw securityError("INVITE_INVALID", 400);
        const existing = await tx.usuario.findFirst({ where: { empresaId: token.empresaId, email: token.emailNormalizado } });
        if (existing) throw securityError("USER_ALREADY_EXISTS", 409);
        const created = await tx.usuario.create({ data: { empresaId: token.empresaId, nome: finalName, email: token.emailNormalizado, senhaHash, papel: token.papel, ativo: true }, select: publicUserSelect });
        await audit(tx, { empresaId: token.empresaId, targetUsuarioId: created.id, acao: "USER_INVITE_ACCEPTED", resultado: "SUCCESS", motivo: "Convite aceito.", correlationId: correlationId(req) });
        return created;
      });
    } catch (error) {
      if (error?.code === "P2002") throw securityError("INVITE_INVALID", 400);
      throw error;
    }
    return usuario;
  }

  function mountRoutes(app, { authenticate, requireRole, publicUser, publicUserSelect, allowedOrigins = [] }) {
    app.post("/auth/refresh", async (req, res) => {
      if (!refreshRequestOriginAllowed(req, allowedOrigins, production)) {
        return authError(res, 403, "Origem nao autorizada para renovar sessao.", "AUTH_CSRF_ORIGIN_REJECTED");
      }
      const rawRefreshToken = readCookie(req, REFRESH_COOKIE_NAME);
      if (!rawRefreshToken) {
        try {
          applyAnonymousRefreshRateLimit(req);
        } catch (error) {
          if (error?.status) {
            res.set("Retry-After", String(error.retryAfterSeconds || 60));
            return authError(res, error.status, "Sessao de renovacao temporariamente bloqueada.", error.code);
          }
          throw error;
        }
        return authError(res, 401, "Sessao de renovacao invalida.", "AUTH_REFRESH_INVALID");
      }
      try {
        applySensitiveRateLimit(req, `refresh:${hashToken(rawRefreshToken)}`);
      } catch (error) {
        if (error?.status) {
          res.set("Retry-After", String(error.retryAfterSeconds || 60));
          return authError(res, error.status, "Sessao de renovacao temporariamente bloqueada.", error.code);
        }
        throw error;
      }
    try {
      const result = await refreshSession({ rawRefreshToken, req });
      setRefreshCookie(res, result.rawRefreshToken, production);
      try {
        await recordAudit({
          empresaId: result.usuario.empresaId,
          actorUsuarioId: result.usuario.id,
          targetUsuarioId: result.usuario.id,
          acao: "REFRESH_SUCCESS",
          resultado: "SUCCESS",
          motivo: "Sessao renovada.",
          correlationId: req.headers["x-correlation-id"],
        });
      } catch (auditError) {
        logInternalError("Falha ao registrar renovacao de sessao.", auditError);
      }
      return res.json({ access_token: result.accessToken, expires_at: result.expiresAt, usuario: publicUser(result.usuario), user: publicUser(result.usuario), empresa: publicEmpresa(result.usuario.empresa), papel: result.usuario.papel });
      } catch (error) {
        if (error?.status) return authError(res, error.status, "Sessao de renovacao invalida.", error.code);
        logInternalError("Falha ao renovar sessao.", error);
        return authError(res, 500, "Nao foi possivel renovar a sessao.", "AUTH_REFRESH_ERROR");
      }
    });

    app.post("/auth/logout", authenticate, async (req, res) => {
      await revokeSession(req.auth.empresaId, req.auth.sessionId, "LOGOUT");
      await recordAudit({ empresaId: req.auth.empresaId, actorUsuarioId: req.auth.usuarioId, acao: "LOGOUT", resultado: "SUCCESS", motivo: "Sessao encerrada.", correlationId: correlationId(req) });
      clearRefreshCookie(res, production);
      return res.json({ ok: true });
    });

    app.post("/auth/logout-all", authenticate, async (req, res) => {
      const revoked = await revokeAllUserSessions(req.auth.empresaId, req.auth.usuarioId, "LOGOUT_ALL");
      await recordAudit({ empresaId: req.auth.empresaId, actorUsuarioId: req.auth.usuarioId, acao: "LOGOUT_ALL", resultado: "SUCCESS", motivo: "Todas as sessoes foram encerradas.", correlationId: correlationId(req) });
      clearRefreshCookie(res, production);
      return res.json({ ok: true, revoked });
    });

    app.get("/auth/sessions", authenticate, async (req, res) => res.json({ data: await listSessions(req.auth.empresaId, req.auth.usuarioId, req.auth.sessionId) }));
    app.post("/auth/sessions/:id/revoke", authenticate, async (req, res) => {
      const changed = await revokeSession(req.auth.empresaId, String(req.params.id), "USER_REQUEST", req.auth.usuarioId);
      if (!changed) return authError(res, 404, "Sessao nao encontrada.", "SESSION_NOT_FOUND");
      await recordAudit({ empresaId: req.auth.empresaId, actorUsuarioId: req.auth.usuarioId, acao: "SESSION_REVOKED", resultado: "SUCCESS", motivo: "Sessao revogada pelo usuario.", correlationId: correlationId(req) });
      return res.json({ ok: true });
    });

    app.get("/perfil", authenticate, async (req, res) => res.json({ usuario: publicUser(req.auth.usuario), empresa: req.auth.empresa, papel: req.auth.papel }));
    app.patch("/perfil", authenticate, async (req, res) => {
      const unknown = unknownFields(req.body, ["nome"]);
      const nome = normalizeName(req.body?.nome);
      if (unknown.length || !nome || nome.length > 120) return authError(res, 400, "Perfil invalido.", "VALIDATION_ERROR");
      const changed = await prisma.usuario.updateMany({ where: { id: req.auth.usuarioId, empresaId: req.auth.empresaId }, data: { nome } });
      if (changed.count !== 1) return authError(res, 404, "Usuario nao encontrado.", "USER_NOT_FOUND");
      const usuario = await prisma.usuario.findFirst({ where: { id: req.auth.usuarioId, empresaId: req.auth.empresaId }, select: publicUserSelect });
      await recordAudit({ empresaId: req.auth.empresaId, actorUsuarioId: req.auth.usuarioId, targetUsuarioId: req.auth.usuarioId, acao: "PROFILE_UPDATED", resultado: "SUCCESS", motivo: "Perfil atualizado.", correlationId: correlationId(req) });
      return res.json(usuario);
    });

    app.post("/auth/change-password", authenticate, async (req, res) => {
      try {
        applySensitiveRateLimit(req, `change-password:${req.auth.usuarioId}`);
        assertPassword(String(req.body?.novaSenha || ""));
        const current = String(req.body?.senhaAtual || "");
        const usuario = await prisma.usuario.findFirst({ where: { id: req.auth.usuarioId, empresaId: req.auth.empresaId } });
        if (!usuario || !(await bcrypt.compare(current, usuario.senhaHash))) return authError(res, 400, "Senha atual invalida.", "CURRENT_PASSWORD_INVALID");
        const senhaHash = await bcrypt.hash(String(req.body.novaSenha), 12);
        await prisma.$transaction(async (tx) => {
          const changed = await tx.usuario.updateMany({
            where: { id: usuario.id, empresaId: req.auth.empresaId, ativo: true, senhaHash: usuario.senhaHash },
            data: { senhaHash },
          });
          if (changed.count !== 1) throw securityError("CURRENT_PASSWORD_INVALID", 400);
          const sessions = await tx.sessaoUsuario.findMany({ where: { empresaId: req.auth.empresaId, usuarioId: usuario.id, revogadoEm: null, id: { not: req.auth.sessionId || "" } }, select: { id: true } });
          const ids = sessions.map((session) => session.id);
          if (ids.length) {
            await tx.sessaoUsuario.updateMany({ where: { empresaId: req.auth.empresaId, id: { in: ids } }, data: { revogadoEm: new Date(), motivoRevogacao: "PASSWORD_CHANGED" } });
            await tx.sessaoRefreshToken.updateMany({ where: { empresaId: req.auth.empresaId, sessaoId: { in: ids }, revogadoEm: null }, data: { revogadoEm: new Date() } });
          }
          await audit(tx, { empresaId: req.auth.empresaId, actorUsuarioId: usuario.id, targetUsuarioId: usuario.id, acao: "PASSWORD_CHANGED", resultado: "SUCCESS", motivo: "Senha alterada pelo usuario.", correlationId: correlationId(req) });
        });
        return res.json({ ok: true });
      } catch (error) {
        if (error?.status) return authError(res, error.status, "Nao foi possivel alterar a senha.", error.code);
        logInternalError("Falha ao alterar senha.", error);
        return authError(res, 500, "Nao foi possivel alterar a senha.", "PASSWORD_CHANGE_ERROR");
      }
    });

    app.post("/auth/forgot-password", async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      const empresaSlug = normalizeCompanySlug(req.body?.empresaSlug || req.body?.slug);
      const generic = { ok: true, message: "Se a conta existir, as instrucoes serao entregues pelo canal configurado." };
      try {
        applySensitiveRateLimit(req, `${email || "invalid-email"}:${empresaSlug || "missing-company"}`);
      } catch (error) {
        if (error?.status) {
          res.set("Retry-After", String(error.retryAfterSeconds || 60));
          return res.status(error.status).json(generic);
        }
        throw error;
      }
      if (!isValidEmail(email) || !empresaSlug) return res.json(generic);
      const usuario = await prisma.usuario.findFirst({
        where: { email: { equals: email, not: SYSTEM_ACTOR_EMAIL }, ativo: true, empresa: { slug: empresaSlug, ativo: true } },
        include: { empresa: true },
      });
      if (!usuario || !usuario.empresa.ativo) return res.json(generic);
      try {
        await createPasswordReset({ usuario, req });
      } catch (error) {
        logInternalError("Falha ao registrar recuperacao de senha.", error);
      }
      return res.json(generic);
    });

    app.post("/auth/reset-password", async (req, res) => {
      try {
        applySensitiveRateLimit(req, hashToken(req.body?.token) || "missing-token");
        await resetPassword({ rawToken: req.body?.token, newPassword: String(req.body?.novaSenha || ""), req });
        return res.json({ ok: true });
      } catch (error) {
        if (error?.status) return authError(res, error.status, "Token invalido, expirado ou ja utilizado.", error.code);
        logInternalError("Falha ao redefinir senha.", error);
        return authError(res, 500, "Nao foi possivel redefinir a senha.", "PASSWORD_RESET_ERROR");
      }
    });

    app.post("/auth/accept-invite", async (req, res) => {
      try {
        applySensitiveRateLimit(req, hashToken(req.body?.token) || "missing-invite-token");
        const usuario = await acceptInvite({ rawToken: req.body?.token, nome: req.body?.nome, newPassword: String(req.body?.senha || ""), req });
        return res.status(201).json({ usuario: publicUser(usuario) });
      } catch (error) {
        if (error?.status) return authError(res, error.status, "Convite invalido ou expirado.", error.code);
        logInternalError("Falha ao aceitar convite.", error);
        return authError(res, 500, "Nao foi possivel aceitar o convite.", "INVITE_ACCEPT_ERROR");
      }
    });

    app.get("/usuarios", authenticate, requireRole("ADMIN"), async (req, res) => {
      const page = positiveInteger(req.query.page, 1);
      const limit = Math.min(positiveInteger(req.query.limit, 20), 100);
      const search = String(req.query.busca || req.query.search || "").trim();
      const ativo = req.query.ativo === undefined ? undefined : String(req.query.ativo) === "true";
      const where = { empresaId: req.auth.empresaId, email: { not: SYSTEM_ACTOR_EMAIL }, ...(ativo === undefined ? {} : { ativo }), ...(search ? { OR: [{ nome: { contains: search } }, { email: { contains: search.toLowerCase() } }] } : {}) };
      const [data, total] = await prisma.$transaction([
        prisma.usuario.findMany({ where, select: publicUserSelect, orderBy: [{ ativo: "desc" }, { nome: "asc" }], skip: (page - 1) * limit, take: limit }),
        prisma.usuario.count({ where }),
      ]);
      return res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    });

    app.get("/usuarios/convites", authenticate, requireRole("ADMIN"), async (req, res) => {
      const data = await prisma.conviteUsuario.findMany({ where: { empresaId: req.auth.empresaId }, orderBy: { criadoEm: "desc" }, take: 100 });
      return res.json({ data: data.map((invite) => publicInvite(invite, invite.deliveryStatus)) });
    });

    app.get("/seguranca/auditoria", authenticate, requireRole("ADMIN"), async (req, res) => {
      const page = positiveInteger(req.query.page, 1);
      const limit = Math.min(100, positiveInteger(req.query.limit, 50));
      const acao = String(req.query.acao || "").trim().slice(0, 80);
      const where = { empresaId: req.auth.empresaId, ...(acao ? { acao } : {}) };
      const [rows, total] = await prisma.$transaction([
        prisma.auditoriaSeguranca.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
        prisma.auditoriaSeguranca.count({ where }),
      ]);
      const userIds = [...new Set(rows.flatMap((row) => [row.actorUsuarioId, row.targetUsuarioId]).filter((id) => Number.isInteger(id)))];
      const users = userIds.length
        ? await prisma.usuario.findMany({ where: { empresaId: req.auth.empresaId, id: { in: userIds } }, select: { id: true, nome: true } })
        : [];
      const names = new Map(users.map((user) => [user.id, user.nome]));
      return res.json({
        data: rows.map((row) => ({
          id: row.id,
          acao: row.acao,
          resultado: row.resultado,
          ator: row.actorUsuarioId ? names.get(row.actorUsuarioId) || "Usuario indisponivel" : "Sistema",
          alvo: row.targetUsuarioId ? names.get(row.targetUsuarioId) || "Usuario indisponivel" : null,
          motivo: row.motivo,
          correlationId: row.correlationId,
          createdAt: row.createdAt,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    });

    app.post("/usuarios", authenticate, requireRole("ADMIN"), async (req, res) => {
      try {
        applySensitiveRateLimit(req, `invite:${req.auth.usuarioId}`);
        if (allowLegacyTestPasswordCreate(req.body)) {
          const usuario = await createLegacyTestUser(req.auth.empresaId, req.auth.usuarioId, req.body, req);
          return res.status(201).json(usuario);
        }
        if (Object.hasOwn(req.body || {}, "senha")) return authError(res, 400, "Administradores nao definem a senha de outro usuario.", "ADMIN_PASSWORD_FORBIDDEN");
        const result = await createInvite({ empresaId: req.auth.empresaId, actorUsuarioId: req.auth.usuarioId, input: req.body || {}, req });
        return res.status(202).json(result);
      } catch (error) {
        if (error?.status) return authError(res, error.status, "Nao foi possivel criar o convite.", error.code);
        logInternalError("Falha ao criar convite de usuario.", error);
        return authError(res, 500, "Nao foi possivel criar o convite.", "INVITE_CREATE_ERROR");
      }
    });

    app.get("/usuarios/:id", authenticate, requireRole("ADMIN"), async (req, res) => {
      const id = positiveInteger(req.params.id, null);
      const usuario = id ? await prisma.usuario.findFirst({ where: { id, empresaId: req.auth.empresaId, email: { not: SYSTEM_ACTOR_EMAIL } }, select: publicUserSelect }) : null;
      if (!usuario) return authError(res, 404, "Usuario nao encontrado.", "USER_NOT_FOUND");
      return res.json(usuario);
    });

    app.patch("/usuarios/:id", authenticate, requireRole("ADMIN"), async (req, res) => {
      const id = positiveInteger(req.params.id, null);
      const data = validateAdminUserUpdate(req.body || {});
      if (!id || data.error) return authError(res, 400, data.error || "ID de usuario invalido.", "VALIDATION_ERROR");
      if (id === req.auth.usuarioId && (data.data.ativo === false || data.data.papel && data.data.papel !== "ADMIN")) return authError(res, 409, "Nao e possivel remover a propria protecao administrativa.", "SELF_LOCKOUT_BLOCKED");
      try {
        const before = await prisma.usuario.findFirst({ where: { id, empresaId: req.auth.empresaId } });
        if (!before) return authError(res, 404, "Usuario nao encontrado.", "USER_NOT_FOUND");
        if (isSystemActor(before)) return authError(res, 409, "Identidade interna reservada.", "SYSTEM_ACTOR_RESERVED");
        const result = await updateUserWithLastAdminGuard({ prisma, id, empresaId: req.auth.empresaId, data: data.data });
        if (result.kind === "last-admin") return authError(res, 409, "A empresa precisa manter ao menos um ADMIN ativo.", "LAST_ADMIN_REQUIRED");
        if (result.kind === "reserved") return authError(res, 409, "Identidade interna reservada.", "SYSTEM_ACTOR_RESERVED");
        await recordAudit({ empresaId: req.auth.empresaId, actorUsuarioId: req.auth.usuarioId, targetUsuarioId: id, acao: "USER_UPDATED", resultado: "SUCCESS", motivo: "Usuario atualizado.", correlationId: correlationId(req) });
        return res.json(result.usuario);
      } catch (error) {
        logInternalError("Falha ao atualizar usuario.", error);
        return authError(res, 500, "Nao foi possivel atualizar o usuario.", "USER_UPDATE_ERROR");
      }
    });

    app.post("/usuarios/:id/desativar", authenticate, requireRole("ADMIN"), async (req, res) => updateUserStatus(req, res, false));
    app.post("/usuarios/:id/reativar", authenticate, requireRole("ADMIN"), async (req, res) => updateUserStatus(req, res, true));
    app.post("/usuarios/:id/iniciar-reset-senha", authenticate, requireRole("ADMIN"), async (req, res) => {
      try {
        applySensitiveRateLimit(req, `admin-reset:${req.auth.usuarioId}:${positiveInteger(req.params.id, 0)}`);
        const result = await startAdminReset({ empresaId: req.auth.empresaId, actorUsuarioId: req.auth.usuarioId, targetUsuarioId: positiveInteger(req.params.id, 0), req });
        if (result.kind === "not-found") return authError(res, 404, "Usuario nao encontrado.", "USER_NOT_FOUND");
        if (result.kind === "reserved") return authError(res, 409, "Identidade interna reservada.", "SYSTEM_ACTOR_RESERVED");
        return res.status(202).json({ ok: true, deliveryStatus: result.status, expiresAt: result.expiresAt });
      } catch (error) {
        if (error?.status) return authError(res, error.status, "Nao foi possivel iniciar o reset.", error.code);
        logInternalError("Falha ao iniciar reset administrativo.", error);
        return authError(res, 500, "Nao foi possivel iniciar o reset.", "ADMIN_RESET_ERROR");
      }
    });
    app.get("/usuarios/:id/sessoes", authenticate, requireRole("ADMIN"), async (req, res) => {
      const id = positiveInteger(req.params.id, 0);
      const target = await prisma.usuario.findFirst({ where: { id, empresaId: req.auth.empresaId }, select: { id: true, email: true } });
      if (!target) return authError(res, 404, "Usuario nao encontrado.", "USER_NOT_FOUND");
      if (isSystemActor(target)) return authError(res, 409, "Identidade interna reservada.", "SYSTEM_ACTOR_RESERVED");
      return res.json({ data: await listSessions(req.auth.empresaId, id, null) });
    });
    app.post("/usuarios/:id/revogar-sessoes", authenticate, requireRole("ADMIN"), async (req, res) => {
      const id = positiveInteger(req.params.id, 0);
      const target = await prisma.usuario.findFirst({ where: { id, empresaId: req.auth.empresaId }, select: { id: true, email: true } });
      if (!target) return authError(res, 404, "Usuario nao encontrado.", "USER_NOT_FOUND");
      if (isSystemActor(target)) return authError(res, 409, "Identidade interna reservada.", "SYSTEM_ACTOR_RESERVED");
      const revoked = await revokeAllUserSessions(req.auth.empresaId, id, "ADMIN_REVOKE");
      await recordAudit({ empresaId: req.auth.empresaId, actorUsuarioId: req.auth.usuarioId, targetUsuarioId: id, acao: "USER_SESSIONS_REVOKED", resultado: "SUCCESS", motivo: "Sessoes revogadas pelo administrador.", correlationId: correlationId(req) });
      return res.json({ ok: true, revoked });
    });
    app.post("/usuarios/convites/:id/reenvia", authenticate, requireRole("ADMIN"), async (req, res) => resendInvite(req, res));
    app.post("/usuarios/convites/:id/revoga", authenticate, requireRole("ADMIN"), async (req, res) => revokeInvite(req, res));
  }

  async function updateUserStatus(req, res, ativo) {
    const id = positiveInteger(req.params.id, 0);
    if (!id || id === req.auth.usuarioId && !ativo) return authError(res, 409, "Operacao de auto-bloqueio nao permitida.", "SELF_LOCKOUT_BLOCKED");
    try {
      const before = await prisma.usuario.findFirst({ where: { id, empresaId: req.auth.empresaId } });
      if (!before) return authError(res, 404, "Usuario nao encontrado.", "USER_NOT_FOUND");
      if (isSystemActor(before)) return authError(res, 409, "Identidade interna reservada.", "SYSTEM_ACTOR_RESERVED");
      const result = await updateUserWithLastAdminGuard({ prisma, id, empresaId: req.auth.empresaId, data: { ativo } });
      if (result.kind === "last-admin") return authError(res, 409, "A empresa precisa manter ao menos um ADMIN ativo.", "LAST_ADMIN_REQUIRED");
      if (result.kind === "reserved") return authError(res, 409, "Identidade interna reservada.", "SYSTEM_ACTOR_RESERVED");
      await recordAudit({ empresaId: req.auth.empresaId, actorUsuarioId: req.auth.usuarioId, targetUsuarioId: id, acao: ativo ? "USER_REACTIVATED" : "USER_DEACTIVATED", resultado: "SUCCESS", motivo: "Status do usuario alterado.", correlationId: correlationId(req) });
      return res.json(result.usuario);
    } catch (error) {
      logInternalError("Falha ao alterar status do usuario.", error);
      return authError(res, 500, "Nao foi possivel alterar o status do usuario.", "USER_STATUS_ERROR");
    }
  }

  async function resendInvite(req, res) {
    try {
      applySensitiveRateLimit(req, `invite-resend:${req.auth.usuarioId}`);
    } catch (error) {
      if (error?.status) {
        res.set("Retry-After", String(error.retryAfterSeconds || 60));
        return authError(res, error.status, "Nao foi possivel reenviar o convite agora.", error.code);
      }
      throw error;
    }
    const id = String(req.params.id || "");
    const existing = await prisma.conviteUsuario.findFirst({ where: { id, empresaId: req.auth.empresaId, aceitoEm: null, revogadoEm: null } });
    if (!existing) return authError(res, 404, "Convite nao encontrado.", "INVITE_NOT_FOUND");
    const rawToken = randomToken();
    const expiraEm = addMilliseconds(new Date(), inviteHours * 60 * 60 * 1000);
    const invite = await prisma.$transaction(async (tx) => {
      const changed = await tx.conviteUsuario.updateMany({ where: { id, empresaId: req.auth.empresaId, aceitoEm: null, revogadoEm: null }, data: { convidadoPorId: req.auth.usuarioId, tokenHash: hashToken(rawToken), expiraEm, deliveryStatus: "PENDING_DELIVERY" } });
      if (changed.count !== 1) throw securityError("INVITE_NOT_FOUND", 404);
      const updated = await tx.conviteUsuario.findFirst({ where: { id, empresaId: req.auth.empresaId } });
      await audit(tx, { empresaId: req.auth.empresaId, actorUsuarioId: req.auth.usuarioId, acao: "USER_INVITE_RESENT", resultado: "SUCCESS", motivo: "Convite reenviado.", correlationId: correlationId(req) });
      return updated;
    });
    const deliveryResult = await delivery.deliver({ kind: "USER_INVITE", email: invite.emailNormalizado, token: rawToken, expiresAt: expiraEm });
    await prisma.conviteUsuario.updateMany({ where: { id, empresaId: req.auth.empresaId }, data: { deliveryStatus: deliveryResult.status } });
    return res.status(202).json({ ok: true, deliveryStatus: deliveryResult.status, expiresAt: expiraEm });
  }

  async function revokeInvite(req, res) {
    const id = String(req.params.id || "");
    const result = await prisma.conviteUsuario.updateMany({ where: { id, empresaId: req.auth.empresaId, aceitoEm: null, revogadoEm: null }, data: { revogadoEm: new Date(), deliveryStatus: "REVOKED" } });
    if (result.count !== 1) return authError(res, 404, "Convite nao encontrado.", "INVITE_NOT_FOUND");
    await recordAudit({ empresaId: req.auth.empresaId, actorUsuarioId: req.auth.usuarioId, acao: "USER_INVITE_REVOKED", resultado: "SUCCESS", motivo: "Convite revogado.", correlationId: correlationId(req) });
    return res.json({ ok: true });
  }

  async function recordAudit(input) {
    return audit(prisma, input);
  }

  async function createLegacyTestUser(empresaId, actorUsuarioId, input, req) {
    const nome = normalizeName(input?.nome);
    const email = normalizeEmail(input?.email);
    const papel = normalizeRole(input?.papel);
    const senha = String(input?.senha || "");
    if (!nome || nome.length > 120 || !isValidEmail(email) || reservedPlatformEmails.has(email) || email === SYSTEM_ACTOR_EMAIL || !papel || senha.length < 8 || senha.length > 128) {
      throw securityError("VALIDATION_ERROR", 400);
    }
    try {
      const usuario = await prisma.usuario.create({
        data: { empresaId, nome, email, senhaHash: await bcrypt.hash(senha, 12), papel },
        select: publicUserSelect,
      });
      await recordAudit({ empresaId, actorUsuarioId, targetUsuarioId: usuario.id, acao: "USER_CREATED_TEST_FIXTURE", resultado: "SUCCESS", motivo: "Compatibilidade exclusiva de fixture test-only.", correlationId: correlationId(req) });
      return usuario;
    } catch (error) {
      if (error?.code === "P2002") throw securityError("USER_ALREADY_EXISTS", 409);
      throw error;
    }
  }

  function applySensitiveRateLimit(req, identity) {
    const ip = requestIp(req);
    sensitiveRateLimiter.check({ identity, ip });
    sensitiveRateLimiter.recordFailure({ identity, ip });
  }

  function applyAnonymousRefreshRateLimit(req) {
    const ip = requestIp(req);
    if (!ip || ip === "unknown") return;
    applySensitiveRateLimit(req, `refresh-anonymous:${ip}`);
  }

  function setRefreshCookie(res, rawToken) {
    res.cookie(REFRESH_COOKIE_NAME, rawToken, cookieOptions(production, refreshDays));
  }

  function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions(production, refreshDays));
  }

  return {
    createLoginSession,
    validateAccessSession,
    refreshSession,
    setRefreshCookie,
    clearRefreshCookie,
    mountRoutes,
    recordAudit,
    publicInvite,
  };
}

function buildSessionTokens({ usuario, sessionId, rawRefreshToken, config }) {
  const accessToken = config.signAccessToken({ usuario, sessionId });
  const decoded = config.jwtDecode(accessToken);
  return { accessToken, rawRefreshToken, expiresAt: new Date(decoded.exp * 1000).toISOString(), sessionId, usuario };
}

async function audit(client, input) {
  return client.auditoriaSeguranca.create({
    data: {
      empresaId: input.empresaId,
      actorUsuarioId: positiveInteger(input.actorUsuarioId, null),
      targetUsuarioId: positiveInteger(input.targetUsuarioId, null),
      acao: String(input.acao || "UNKNOWN").slice(0, 80),
      resultado: String(input.resultado || "UNKNOWN").slice(0, 40),
      correlationId: sanitizeCorrelation(input.correlationId),
      motivo: sanitizeReason(input.motivo),
    },
  });
}

async function updateUserWithLastAdminGuard({ prisma, id, empresaId, data }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.findFirst({ where: { id, empresaId } });
        if (!usuario) return { kind: "not-found" };
        if (isSystemActor(usuario)) return { kind: "reserved" };
        const removesActiveAdmin = usuario.ativo && usuario.papel === "ADMIN" && (data.ativo === false || data.papel && data.papel !== "ADMIN");
        if (removesActiveAdmin && await tx.usuario.count({ where: { empresaId, papel: "ADMIN", ativo: true } }) <= 1) return { kind: "last-admin" };
        const changed = await tx.usuario.updateMany({ where: { id, empresaId }, data });
        if (changed.count !== 1) return { kind: "not-found" };
        if (data.ativo === false) {
          const sessions = await tx.sessaoUsuario.findMany({
            where: { empresaId, usuarioId: id, revogadoEm: null },
            select: { id: true },
          });
          const sessionIds = sessions.map((session) => session.id);
          if (sessionIds.length) {
            const revokedAt = new Date();
            await tx.sessaoUsuario.updateMany({
              where: { empresaId, id: { in: sessionIds }, revogadoEm: null },
              data: { revogadoEm: revokedAt, motivoRevogacao: "USER_DEACTIVATED" },
            });
            await tx.sessaoRefreshToken.updateMany({
              where: { empresaId, sessaoId: { in: sessionIds }, revogadoEm: null },
              data: { revogadoEm: revokedAt },
            });
          }
        }
        return { kind: "updated", usuario: await tx.usuario.findFirst({ where: { id, empresaId }, select: publicUserSelect }) };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!isRetryableConflict(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
  throw new Error("USER_UPDATE_CONFLICT");
}

const publicUserSelect = { id: true, empresaId: true, nome: true, email: true, papel: true, ativo: true, ultimoLoginEm: true, createdAt: true, updatedAt: true };

function publicInvite(invite, deliveryStatus) {
  return { id: invite.id, nome: invite.nomeConvidado, email: invite.emailNormalizado, papel: invite.papel, expiraEm: invite.expiraEm, aceitoEm: invite.aceitoEm, revogadoEm: invite.revogadoEm, deliveryStatus: deliveryStatus || invite.deliveryStatus, criadoEm: invite.criadoEm };
}

function validateAdminUserUpdate(body) {
  const unknown = unknownFields(body, ["nome", "papel"]);
  if (unknown.length || !Object.keys(body).length) return { error: "Campos de usuario invalidos." };
  const data = {};
  if (Object.hasOwn(body, "nome")) {
    data.nome = normalizeName(body.nome);
    if (!data.nome || data.nome.length > 120) return { error: "Nome invalido." };
  }
  if (Object.hasOwn(body, "papel")) {
    data.papel = normalizeRole(body.papel);
    if (!data.papel) return { error: "Papel invalido." };
  }
  return { data };
}

function assertPassword(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH || password.length > 128 || COMMON_PASSWORDS.has(password.toLowerCase())) throw securityError("PASSWORD_POLICY_INVALID", 400);
}

function securityError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCompanySlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeRole(value) {
  const role = String(value || "VENDEDOR").trim().toUpperCase();
  return ["ADMIN", "GERENTE", "VENDEDOR"].includes(role) ? role : null;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function unknownFields(body, allowed) {
  const allowedSet = new Set(allowed);
  return Object.keys(body || {}).filter((field) => !allowedSet.has(field));
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(value) {
  const text = String(value || "");
  return text ? crypto.createHash("sha256").update(text).digest("hex") : "";
}

function allowLegacyTestPasswordCreate(body) {
  return process.env.NODE_ENV === "test"
    && !globalThis.__CRM_TEST_SECURITY_DELIVERY
    && Object.hasOwn(body || {}, "senha");
}

function hashIp(req) {
  const ip = String(req?.ip || req?.socket?.remoteAddress || "").trim();
  return ip ? crypto.createHash("sha256").update(ip).digest("hex") : null;
}

function sanitizeUserAgent(value) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_USER_AGENT_LENGTH) || null;
}

function sanitizeReason(value) {
  const text = String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, MAX_REASON_LENGTH) : null;
}

function sanitizeCorrelation(value) {
  const text = String(value || "").trim();
  return /^[a-zA-Z0-9._:-]{1,100}$/.test(text) ? text : null;
}

function correlationId(req) {
  return sanitizeCorrelation(req?.headers?.["x-correlation-id"]) || crypto.randomUUID();
}

function readCookie(req, name) {
  const raw = String(req?.headers?.cookie || "");
  const pair = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!pair) return "";
  try {
    return decodeURIComponent(pair.slice(name.length + 1));
  } catch {
    return "";
  }
}

function cookieOptions(production, days) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    path: "/auth",
    maxAge: days * 24 * 60 * 60 * 1000,
  };
}

function refreshRequestOriginAllowed(req, allowedOrigins, production) {
  const origin = String(req?.headers?.origin || "").trim();
  if (origin) return allowedOrigins.includes(origin);

  const referer = String(req?.headers?.referer || "").trim();
  if (referer) {
    try {
      return allowedOrigins.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  return !production;
}

function addMilliseconds(date, milliseconds) {
  return new Date(date.getTime() + milliseconds);
}

function isRetryableConflict(error) {
  return ["P1008", "P2028", "P2034"].includes(error?.code) || /database is locked/i.test(String(error?.message || ""));
}

function publicEmpresa(empresa) {
  return { id: empresa.id, nome: empresa.nome, slug: empresa.slug, ativo: empresa.ativo, createdAt: empresa.createdAt, updatedAt: empresa.updatedAt };
}

function authError(res, status, erro, codigo) {
  return res.status(status).json({ erro, codigo });
}

function logInternalError(message, error) {
  console.error(message, { name: error?.name, code: error?.code });
}

module.exports = {
  REFRESH_COOKIE_NAME,
  createUserSecurity,
  assertPassword,
  publicUserSelect,
  publicInvite,
  hashToken,
  refreshRequestOriginAllowed,
  updateUserWithLastAdminGuard,
};
