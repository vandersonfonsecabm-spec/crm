const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const PAPEIS = new Set(["ADMIN", "GERENTE", "VENDEDOR"]);
const JWT_ISSUER = "crm-agro-saas-api";
const JWT_AUDIENCE = "crm-agro-saas";
const LOCAL_JWT_SECRET = "local-development-only-change-me";

function createAuth({ prisma }) {
  const production = process.env.NODE_ENV === "production";
  const jwtSecret = String(process.env.JWT_SECRET || "").trim();

  if (production && !jwtSecret) {
    throw new Error("JWT_SECRET e obrigatorio em producao.");
  }

  if (!production && !jwtSecret) {
    console.warn("JWT_SECRET ausente. Usando segredo local temporario; defina JWT_SECRET fora de producao compartilhada.");
  }

  const config = {
    secret: jwtSecret || LOCAL_JWT_SECRET,
    expiresIn: String(process.env.JWT_EXPIRES_IN || "8h").trim(),
    allowCompanyRegistration: parseBoolean(
      process.env.ALLOW_COMPANY_REGISTRATION,
      !production,
    ),
  };

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

      req.auth = {
        usuarioId: usuario.id,
        empresaId: usuario.empresaId,
        papel: usuario.papel,
        usuario: publicUsuario(usuario),
        empresa: publicEmpresa(usuario.empresa),
      };
      return next();
    } catch (error) {
      console.error("Falha ao validar contexto autenticado.", error);
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
    app.post("/auth/register-company", async (req, res) => {
      if (!config.allowCompanyRegistration) {
        return authError(res, 403, "Cadastro de empresas desabilitado.", "AUTH_FORBIDDEN");
      }

      const validation = validateCompanyRegistration(req.body);
      if (validation.error) {
        return authError(res, 400, validation.error, "VALIDATION_ERROR");
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
        console.error("Falha ao cadastrar empresa.", error);
        return authError(res, 500, "Nao foi possivel cadastrar a empresa.", "AUTH_REGISTRATION_ERROR");
      }
    });

    app.post("/auth/login", async (req, res) => {
      const email = normalizeEmail(req.body && req.body.email);
      const senha = String((req.body && req.body.senha) || "");
      const slug = normalizeSlug(req.body && (req.body.empresaSlug || req.body.slug));

      if (!email || !senha) {
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
          return authError(res, 401, "E-mail ou senha invalidos.", "AUTH_INVALID_CREDENTIALS");
        }

        const usuario = usuarios[0];
        const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);
        if (!senhaCorreta) {
          return authError(res, 401, "E-mail ou senha invalidos.", "AUTH_INVALID_CREDENTIALS");
        }
        if (!usuario.ativo) {
          return authError(res, 403, "Usuario inativo.", "USER_INACTIVE");
        }
        if (!usuario.empresa.ativo) {
          return authError(res, 403, "Empresa inativa.", "COMPANY_INACTIVE");
        }

        const updated = await prisma.usuario.update({
          where: { id: usuario.id },
          data: { ultimoLoginEm: new Date() },
          include: { empresa: true },
        });
        return res.json(loginResponse(updated, config));
      } catch (error) {
        console.error("Falha ao autenticar usuario.", error);
        return authError(res, 500, "Nao foi possivel autenticar agora.", "AUTH_LOGIN_ERROR");
      }
    });

    app.get("/auth/me", authenticate, (req, res) => {
      res.json({
        usuario: req.auth.usuario,
        empresa: req.auth.empresa,
        papel: req.auth.papel,
        status: "ATIVO",
      });
    });

    app.get("/usuarios", authenticate, requireRole("ADMIN", "GERENTE"), async (req, res) => {
      const page = positiveInteger(req.query.page, 1);
      const limit = Math.min(positiveInteger(req.query.limit, 20), 100);
      const search = String(req.query.busca || req.query.search || "").trim();
      const where = {
        empresaId: req.auth.empresaId,
        ...(search
          ? { OR: [{ nome: { contains: search } }, { email: { contains: search.toLowerCase() } }] }
          : {}),
      };

      try {
        const [data, total] = await prisma.$transaction([
          prisma.usuario.findMany({
            where,
            select: publicUsuarioSelect,
            orderBy: [{ ativo: "desc" }, { nome: "asc" }],
            skip: (page - 1) * limit,
            take: limit,
          }),
          prisma.usuario.count({ where }),
        ]);
        return res.json({
          data,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
      } catch (error) {
        console.error("Falha ao listar usuarios.", error);
        return authError(res, 500, "Nao foi possivel listar os usuarios.", "USER_LIST_ERROR");
      }
    });

    app.post("/usuarios", authenticate, requireRole("ADMIN"), async (req, res) => {
      const validation = validateNewUser(req.body);
      if (validation.error) {
        return authError(res, 400, validation.error, "VALIDATION_ERROR");
      }

      try {
        const senhaHash = await bcrypt.hash(validation.data.senha, 12);
        const usuario = await prisma.usuario.create({
          data: {
            empresaId: req.auth.empresaId,
            nome: validation.data.nome,
            email: validation.data.email,
            senhaHash,
            papel: validation.data.papel,
          },
          select: publicUsuarioSelect,
        });
        return res.status(201).json(usuario);
      } catch (error) {
        if (error && error.code === "P2002") {
          return authError(res, 409, "Ja existe um usuario com este e-mail na empresa.", "EMAIL_ALREADY_EXISTS");
        }
        console.error("Falha ao criar usuario.", error);
        return authError(res, 500, "Nao foi possivel criar o usuario.", "USER_CREATE_ERROR");
      }
    });

    app.patch("/usuarios/:id", authenticate, requireRole("ADMIN"), async (req, res) => {
      const id = positiveInteger(req.params.id, null);
      const validation = validateUserUpdate(req.body);
      if (!id || validation.error) {
        return authError(res, 400, validation.error || "ID de usuario invalido.", "VALIDATION_ERROR");
      }

      try {
        const usuario = await prisma.usuario.findFirst({
          where: { id, empresaId: req.auth.empresaId },
        });
        if (!usuario) {
          return authError(res, 404, "Usuario nao encontrado.", "USER_NOT_FOUND");
        }

        const removesActiveAdmin =
          usuario.ativo && usuario.papel === "ADMIN" &&
          (validation.data.ativo === false || (validation.data.papel && validation.data.papel !== "ADMIN"));
        if (removesActiveAdmin) {
          const activeAdmins = await prisma.usuario.count({
            where: { empresaId: req.auth.empresaId, papel: "ADMIN", ativo: true },
          });
          if (activeAdmins <= 1) {
            return authError(res, 409, "A empresa precisa manter ao menos um ADMIN ativo.", "LAST_ADMIN_REQUIRED");
          }
        }

        const updated = await prisma.usuario.update({
          where: { id },
          data: validation.data,
          select: publicUsuarioSelect,
        });
        return res.json(updated);
      } catch (error) {
        console.error("Falha ao atualizar usuario.", error);
        return authError(res, 500, "Nao foi possivel atualizar o usuario.", "USER_UPDATE_ERROR");
      }
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

function loginResponse(usuario, config) {
  const token = jwt.sign(
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
    expires_at: new Date(decoded.exp * 1000).toISOString(),
    usuario: publicUsuario(usuario),
    user: publicUsuario(usuario),
    empresa: publicEmpresa(usuario.empresa),
    papel: usuario.papel,
  };
}

function publicUsuario(usuario) {
  const { senhaHash, empresa, ...safe } = usuario;
  return safe;
}

function hasOnlyExpectedClaims(payload) {
  const expected = new Set(["sub", "empresaId", "papel", "iat", "exp", "iss", "aud"]);
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
  if (senha.length < 8 || senha.length > 128) return { error: "A senha deve ter entre 8 e 128 caracteres." };
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

function authError(res, status, erro, codigo) {
  return res.status(status).json({ erro, codigo });
}

module.exports = { createAuth, normalizeEmail, normalizeSlug };
