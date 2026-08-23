const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { capabilitiesForTenant } = require("./tenant-features/service");
const { createSecurityDelivery } = require("./security-delivery");
const { createUserSecurity } = require("./user-security");
const {
  authIdentity,
  createAuthRateLimiter,
  createPostgresAuthRateLimiter,
  requestIp,
} = require("./auth-rate-limiter");

const PAPEIS = new Set(["ADMIN", "GERENTE", "VENDEDOR"]);
const JWT_ISSUER = "crm-agro-saas-api";
const JWT_AUDIENCE = "crm-agro-saas";
const LOCAL_JWT_SECRET = "local-development-only-change-me";

function createAuth({ prisma, loginRateLimiter, sensitiveRateLimiter, securityDelivery = createSecurityDelivery({ env: process.env }), allowedOrigins = [] }) {
  const production = process.env.NODE_ENV === "production";
  const railwayRuntime = Boolean(
    process.env.RAILWAY_SERVICE_ID
      || process.env.RAILWAY_DEPLOYMENT_ID
      || process.env.RAILWAY_PROJECT_ID
      || process.env.RAILWAY_VOLUME_MOUNT_PATH,
  );
  const jwtSecret = String(process.env.JWT_SECRET || "").trim();

  if (railwayRuntime && !production) {
    throw new Error("NODE_ENV=production e obrigatorio no Railway.");
  }

  if (production && !jwtSecret) {
    throw new Error("JWT_SECRET e obrigatorio em producao.");
  }

  if (!production && !jwtSecret) {
    console.warn("JWT_SECRET ausente. Usando segredo local temporario; defina JWT_SECRET fora de producao compartilhada.");
  }

  const postgresqlRuntime = String(process.env.CRM_DATABASE_PROVIDER || "").trim().toLowerCase() === "postgresql";
  const loginLimiter = loginRateLimiter || (production && postgresqlRuntime
    ? createPostgresAuthRateLimiter({ prisma })
    : createAuthRateLimiter());
  const securityLimiter = sensitiveRateLimiter || (production && postgresqlRuntime
    ? createPostgresAuthRateLimiter({ prisma, ipLimit: 40 })
    : createAuthRateLimiter({ identityLimit: 8, ipLimit: 40 }));

  const config = {
    secret: jwtSecret || LOCAL_JWT_SECRET,
    expiresIn: String(process.env.JWT_EXPIRES_IN || "15m").trim(),
    allowCompanyRegistration: parseBoolean(
      process.env.ALLOW_COMPANY_REGISTRATION,
      !production,
    ),
  };

  const security = createUserSecurity({
    prisma,
    jwt,
    bcrypt,
    config: {
      ...config,
      signAccessToken: ({ usuario, sessionId }) => jwt.sign(
        { empresaId: usuario.empresaId, papel: usuario.papel, sid: sessionId },
        config.secret,
        {
          subject: String(usuario.id),
          expiresIn: config.expiresIn,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      ),
      jwtDecode: (token) => jwt.decode(token),
    },
    production,
    reservedPlatformEmails: parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS),
    securityDelivery,
    sensitiveRateLimiter: securityLimiter,
  });

  async function authenticate(req, res, next) {
    const authorization = String(req.headers.authorization || "");
    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      return authError(res, 401, "Token de autenticacao obrigatorio.", "AUTH_TOKEN_REQUIRED");
    }

    let payload;
    try {
      payload = jwt.verify(token, config.secret, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch {
      return authError(res, 401, "Token invalido ou expirado.", "AUTH_TOKEN_INVALID");
    }

    if (!hasOnlyExpectedClaims(payload)) {
      return authError(res, 401, "Token invalido ou expirado.", "AUTH_TOKEN_INVALID");
    }

    const usuarioId = Number(payload.sub);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return authError(res, 401, "Token invalido ou expirado.", "AUTH_TOKEN_INVALID");
    }

    try {
      const accessSession = await security.validateAccessSession({
        sessionId: typeof payload.sid === "string" ? payload.sid : null,
        empresaId: Number(payload.empresaId),
        usuarioId,
      });
      if (!accessSession.valid) {
        return authError(res, 401, "Sessao invalida ou revogada.", "AUTH_SESSION_REVOKED");
      }
      const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioId },
        include: { empresa: true },
      });

      if (!usuario || usuario.empresaId !== Number(payload.empresaId)) {
        return authError(res, 401, "Token invalido ou expirado.", "AUTH_TOKEN_INVALID");
      }
      if (!usuario.ativo) {
        return authError(res, 403, "Usuario inativo.", "USER_INACTIVE");
      }
      if (!usuario.empresa.ativo) {
        return authError(res, 403, "Empresa inativa.", "COMPANY_INACTIVE");
      }

      const platformOperator = await resolvePlatformOperator({ prisma, usuario, env: process.env });
      req.auth = {
        usuarioId: usuario.id,
        empresaId: usuario.empresaId,
        papel: usuario.papel,
        sessionId: typeof payload.sid === "string" ? payload.sid : null,
        usuario: publicUsuario(usuario),
        empresa: publicEmpresa(usuario.empresa),
        isPlatformOperator: platformOperator,
      };
      return next();
    } catch (error) {
      logInternalError("Falha ao validar contexto autenticado.", error);
      return authError(res, 500, "Nao foi possivel validar a autenticacao.", "AUTH_CONTEXT_ERROR");
    }
  }

  function requireRole(...allowedRoles) {
    return (req, res, next) => {
      if (!req.auth || !allowedRoles.includes(req.auth.papel)) {
        return authError(res, 403, "Voce nao possui permissao para esta operacao.", "AUTH_FORBIDDEN");
      }
      return next();
    };
  }

  function mountRoutes(app) {
    security.mountRoutes(app, {
      authenticate,
      requireRole,
      publicUser: publicUsuario,
      publicUserSelect: publicUsuarioSelect,
      allowedOrigins,
    });

    app.post("/auth/register-company", async (req, res) => {
      if (!config.allowCompanyRegistration) {
        return authError(res, 403, "Cadastro de empresas desabilitado.", "AUTH_FORBIDDEN");
      }

      const validation = validateCompanyRegistration(req.body);
      if (validation.error) {
        return authError(res, 400, validation.error, "VALIDATION_ERROR");
      }
      if (isReservedPlatformEmail(validation.data.email, process.env)) {
        return authError(res, 409, "Empresa ou e-mail ja cadastrado.", "EMAIL_ALREADY_EXISTS");
      }

      try {
        const senhaHash = await bcrypt.hash(validation.data.senha, 12);
        const result = await prisma.$transaction(async (tx) => {
          const empresa = await tx.empresa.create({
            data: {
              nome: validation.data.empresaNome,
              slug: validation.data.slug,
            },
          });
          const usuario = await tx.usuario.create({
            data: {
              empresaId: empresa.id,
              nome: validation.data.adminNome,
              email: validation.data.email,
              senhaHash,
              papel: "ADMIN",
            },
          });
          return { empresa, usuario };
        });

        return res.status(201).json({
          empresa: publicEmpresa(result.empresa),
          usuario: publicUsuario(result.usuario),
        });
      } catch (error) {
        if (error && error.code === "P2002") {
          return authError(res, 409, "Empresa ou e-mail ja cadastrado.", "EMAIL_ALREADY_EXISTS");
        }
        logInternalError("Falha ao cadastrar empresa.", error);
        return authError(res, 500, "Nao foi possivel cadastrar a empresa.", "AUTH_REGISTRATION_ERROR");
      }
    });

    app.post("/auth/login", async (req, res) => {
      const email = normalizeEmail(req.body && req.body.email);
      const senha = String((req.body && req.body.senha) || "");
      const slug = normalizeSlug(req.body && (req.body.empresaSlug || req.body.slug));
      const limiterContext = {
        identity: authIdentity(email, slug),
        ip: requestIp(req),
      };

      try {
        await loginLimiter.check(limiterContext);
      } catch (error) {
        if (error.code === "AUTH_RATE_LIMITED") {
          if (error.retryAfterSeconds) res.set("Retry-After", String(error.retryAfterSeconds));
          return authError(res, 429, "Nao foi possivel autenticar agora.", error.code);
        }
        return authError(res, error.status || 503, "Nao foi possivel autenticar agora.", error.code || "AUTH_RATE_LIMIT_STORE_UNAVAILABLE");
      }

      if (!email || !senha) {
        await loginLimiter.recordFailure(limiterContext);
        return authError(res, 401, "E-mail ou senha invalidos.", "AUTH_INVALID_CREDENTIALS");
      }

      try {
        const usuarios = await prisma.usuario.findMany({
          where: {
            email,
            ...(slug ? { empresa: { slug } } : {}),
          },
          include: { empresa: true },
          take: 2,
        });
        if (usuarios.length !== 1) {
          await loginLimiter.recordFailure(limiterContext);
          return authError(res, 401, "E-mail ou senha invalidos.", "AUTH_INVALID_CREDENTIALS");
        }

        const usuario = usuarios[0];
        const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);
        if (!senhaCorreta) {
          try {
            await security.recordAudit({
              empresaId: usuario.empresaId,
              targetUsuarioId: usuario.id,
              acao: "LOGIN_REJECTED",
              resultado: "FAILURE",
              motivo: "Credencial rejeitada.",
              correlationId: req.headers["x-correlation-id"],
            });
          } catch (auditError) {
            logInternalError("Falha ao registrar rejeicao de login.", auditError);
          }
          await loginLimiter.recordFailure(limiterContext);
          return authError(res, 401, "E-mail ou senha invalidos.", "AUTH_INVALID_CREDENTIALS");
        }
        if (process.env.NODE_ENV === "test" && typeof globalThis.__CRM_TEST_AUTH_AFTER_PASSWORD_COMPARE === "function") {
          await globalThis.__CRM_TEST_AUTH_AFTER_PASSWORD_COMPARE({ usuarioId: usuario.id, empresaId: usuario.empresaId });
        }
        if (!usuario.ativo) {
          return authError(res, 403, "Usuario inativo.", "USER_INACTIVE");
        }
        if (!usuario.empresa.ativo) {
          return authError(res, 403, "Empresa inativa.", "COMPANY_INACTIVE");
        }

        const session = await security.createLoginSession({ usuario, expectedPasswordHash: usuario.senhaHash, req });
        const updated = session.usuario;
        const platformOperator = await resolvePlatformOperator({ prisma, usuario: updated, env: process.env });
        security.setRefreshCookie(res, session.rawRefreshToken);
        try {
          await security.recordAudit({
            empresaId: updated.empresaId,
            actorUsuarioId: updated.id,
            targetUsuarioId: updated.id,
            acao: "LOGIN_SUCCESS",
            resultado: "SUCCESS",
            motivo: "Login concluido.",
            correlationId: req.headers["x-correlation-id"],
          });
        } catch (auditError) {
          logInternalError("Falha ao registrar sucesso de login.", auditError);
        }
        await loginLimiter.recordSuccess(limiterContext);
        return res.json(loginResponse(updated, config, platformOperator, session));
      } catch (error) {
        if (error?.status) {
          const message = error.code === "ACCOUNT_INACTIVE"
            ? "Usuario inativo."
            : error.code === "AUTH_CREDENTIAL_CHANGED"
              ? "E-mail ou senha invalidos."
              : "Nao foi possivel autenticar agora.";
          return authError(res, error.status, message, error.code);
        }
        logInternalError("Falha ao autenticar usuario.", error);
        return authError(res, 500, "Nao foi possivel autenticar agora.", "AUTH_LOGIN_ERROR");
      }
    });

    app.get("/auth/me", authenticate, async (req, res) => {
      const capabilities = await capabilitiesForTenant({ prisma, empresaId: req.auth.empresaId });
      res.json({
        usuario: req.auth.usuario,
        email: req.auth.usuario.email,
        empresa: req.auth.empresa,
        papel: req.auth.papel,
        status: "ATIVO",
        capabilities,
        isPlatformOperator: req.auth.isPlatformOperator === true,
      });
    });

  }

  return { authenticate, requireRole, mountRoutes, config };
}

const publicUsuarioSelect = {
  id: true,
  empresaId: true,
  nome: true,
  email: true,
  papel: true,
  ativo: true,
  ultimoLoginEm: true,
  createdAt: true,
  updatedAt: true,
};

function loginResponse(usuario, config, platformOperator = false, session = null) {
  const token = session?.accessToken || jwt.sign(
    {
      empresaId: usuario.empresaId,
      papel: usuario.papel,
    },
    config.secret,
    {
      subject: String(usuario.id),
      expiresIn: config.expiresIn,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
  );
  const decoded = jwt.decode(token);
  return {
    access_token: token,
    expires_at: session?.expiresAt || new Date(decoded.exp * 1000).toISOString(),
    usuario: publicUsuario(usuario),
    user: publicUsuario(usuario),
    empresa: publicEmpresa(usuario.empresa),
    papel: usuario.papel,
    isPlatformOperator: platformOperator === true,
  };
}

function publicUsuario(usuario) {
  const { senhaHash, empresa, ...safe } = usuario;
  return safe;
}

function hasOnlyExpectedClaims(payload) {
  const expected = new Set(["sub", "empresaId", "papel", "sid", "iat", "exp", "iss", "aud"]);
  return payload && typeof payload === "object" && Object.keys(payload).every((claim) => expected.has(claim));
}

function publicEmpresa(empresa) {
  return {
    id: empresa.id,
    nome: empresa.nome,
    slug: empresa.slug,
    ativo: empresa.ativo,
    createdAt: empresa.createdAt,
    updatedAt: empresa.updatedAt,
  };
}

function validateCompanyRegistration(body = {}) {
  const unknown = unknownFields(body, ["empresaNome", "nomeEmpresa", "adminNome", "nomeAdministrador", "email", "senha", "slug"]);
  const empresaNome = String(body.empresaNome || body.nomeEmpresa || "").trim().replace(/\s+/g, " ");
  const adminNome = String(body.adminNome || body.nomeAdministrador || "").trim().replace(/\s+/g, " ");
  const email = normalizeEmail(body.email);
  const senha = String(body.senha || "");
  const slug = normalizeSlug(body.slug || empresaNome);

  if (unknown.length) return { error: `Campos nao permitidos: ${unknown.join(", ")}.` };
  if (!empresaNome || empresaNome.length > 120) return { error: "Nome da empresa obrigatorio, com ate 120 caracteres." };
  if (!adminNome || adminNome.length > 120) return { error: "Nome do administrador obrigatorio, com ate 120 caracteres." };
  if (!isValidEmail(email)) return { error: "E-mail invalido." };
  if (senha.length < 12 || senha.length > 128) return { error: "A senha deve ter entre 12 e 128 caracteres." };
  if (!slug || slug.length > 80) return { error: "Slug da empresa invalido." };
  return { data: { empresaNome, adminNome, email, senha, slug } };
}

function validateNewUser(body = {}) {
  const unknown = unknownFields(body, ["nome", "email", "senha", "papel"]);
  const nome = String(body.nome || "").trim().replace(/\s+/g, " ");
  const email = normalizeEmail(body.email);
  const senha = String(body.senha || "");
  const papel = String(body.papel || "VENDEDOR").trim().toUpperCase();
  if (unknown.length) return { error: `Campos nao permitidos: ${unknown.join(", ")}.` };
  if (!nome || nome.length > 120) return { error: "Nome obrigatorio, com ate 120 caracteres." };
  if (!isValidEmail(email)) return { error: "E-mail invalido." };
  if (senha.length < 8 || senha.length > 128) return { error: "A senha deve ter entre 8 e 128 caracteres." };
  if (!PAPEIS.has(papel)) return { error: "Papel de usuario invalido." };
  return { data: { nome, email, senha, papel } };
}

function validateUserUpdate(body = {}) {
  const unknown = unknownFields(body, ["nome", "papel", "ativo"]);
  if (unknown.length) return { error: `Campos nao permitidos: ${unknown.join(", ")}.` };
  if (!Object.keys(body).length) return { error: "Informe ao menos um campo para atualizar." };
  const data = {};
  if (Object.hasOwn(body, "nome")) {
    data.nome = String(body.nome || "").trim().replace(/\s+/g, " ");
    if (!data.nome || data.nome.length > 120) return { error: "Nome obrigatorio, com ate 120 caracteres." };
  }
  if (Object.hasOwn(body, "papel")) {
    data.papel = String(body.papel || "").trim().toUpperCase();
    if (!PAPEIS.has(data.papel)) return { error: "Papel de usuario invalido." };
  }
  if (Object.hasOwn(body, "ativo")) {
    if (typeof body.ativo !== "boolean") return { error: "Ativo deve ser booleano." };
    data.ativo = body.ativo;
  }
  return { data };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function logInternalError(message, error) {
  console.error(message, { name: error?.name, code: error?.code });
}

function normalizeSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function parsePlatformAdminEmails(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => normalizeEmail(item))
      .filter(Boolean),
  );
}

function isPlatformOperator(usuario, env = process.env) {
  if (!usuario || usuario.ativo !== true) return false;
  const email = normalizeEmail(usuario.email);
  if (!email) return false;
  return parsePlatformAdminEmails(env.PLATFORM_ADMIN_EMAILS).has(email);
}

function isReservedPlatformEmail(email, env = process.env) {
  return parsePlatformAdminEmails(env.PLATFORM_ADMIN_EMAILS).has(normalizeEmail(email));
}

async function resolvePlatformOperator({ prisma, usuario, env = process.env }) {
  if (!isPlatformOperator(usuario, env)) return false;
  const email = normalizeEmail(usuario.email);
  const matchingUsers = await prisma.usuario.count({ where: { email } });
  return matchingUsers === 1;
}

async function updateTenantUser({ prisma, id, empresaId, data }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.findFirst({ where: { id, empresaId } });
        if (!usuario) return { kind: "not-found" };

        const removesActiveAdmin = usuario.ativo && usuario.papel === "ADMIN"
          && (data.ativo === false || (data.papel && data.papel !== "ADMIN"));
        if (removesActiveAdmin) {
          const activeAdmins = await tx.usuario.count({ where: { empresaId, papel: "ADMIN", ativo: true } });
          if (activeAdmins <= 1) return { kind: "last-admin" };
        }

        const changed = await tx.usuario.updateMany({ where: { id, empresaId }, data });
        if (changed.count !== 1) return { kind: "not-found" };
        const updated = await tx.usuario.findFirst({ where: { id, empresaId }, select: publicUsuarioSelect });
        return { kind: "updated", usuario: updated };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!isRetryableUserUpdateConflict(error) || attempt === 2) throw error;
      await delay(15 * (attempt + 1));
    }
  }
  throw new Error("Falha inesperada ao atualizar usuario.");
}

function isRetryableUserUpdateConflict(error) {
  return ["P1008", "P2028", "P2034"].includes(error?.code)
    || /database is locked/i.test(String(error?.message || ""));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authError(res, status, erro, codigo) {
  return res.status(status).json({ erro, codigo });
}

module.exports = { createAuth, isPlatformOperator, normalizeEmail, normalizeSlug, parsePlatformAdminEmails, resolvePlatformOperator, updateTenantUser, validateCompanyRegistration };
