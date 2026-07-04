const { encryptCredentials, hasEncryptedCredentials } = require("./crypto");
const { createIntegrationAdapter } = require("./adapters");
const { createCanonicalService } = require("./canonicalService");

const TIPOS_INTEGRACAO = new Set(["BLING", "OMIE", "CONTA_AZUL", "TINY", "ALTERDATA", "CSV", "XLSX", "XML", "JSON", "CUSTOM"]);
const STATUS_INTEGRACAO = new Set(["PENDENTE", "ATIVA", "INATIVA", "ERRO"]);
const FORMATOS_IMPORTACAO = new Set(["CSV", "XLSX", "XML", "JSON"]);
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

function mountIntegrationHubRoutes({ app, prisma, authenticate, requireRole }) {
  const requireAdmin = [authenticate, requireRole("ADMIN")];
  const canonicalService = createCanonicalService({ prisma });

  app.get("/integracoes", ...requireAdmin, async (req, res) => {
    try {
      const { page, limit, skip } = pagination(req.query);
      const where = integrationWhere(req.auth.empresaId, req.query);
      const [total, integracoes] = await Promise.all([
        prisma.integracao.count({ where }),
        prisma.integracao.findMany({
          where,
          orderBy: [{ ativo: "desc" }, { nome: "asc" }, { id: "asc" }],
          skip,
          take: limit,
        }),
      ]);

      return res.json(paginated(integracoes.map(integrationResponse), total, page, limit));
    } catch (error) {
      return integrationError(res, error, "Nao foi possivel listar integracoes.");
    }
  });

  app.get("/integracoes/:id", ...requireAdmin, async (req, res) => {
    try {
      const integracao = await findIntegrationOrThrow(prisma, req);
      return res.json(integrationResponse(integracao));
    } catch (error) {
      return integrationError(res, error, "Nao foi possivel buscar a integracao.");
    }
  });

  app.post("/integracoes", ...requireAdmin, async (req, res) => {
    try {
      const payload = integrationPayload(req.body, { partial: false });
      const encrypted = payload.credentials ? encryptCredentials(payload.credentials) : null;
      const integracao = await prisma.integracao.create({
        data: {
          empresaId: req.auth.empresaId,
          nome: payload.data.nome,
          tipo: payload.data.tipo,
          status: payload.data.status,
          modo: "SOMENTE_LEITURA",
          configuracaoJson: payload.data.configuracaoJson,
          credenciaisCriptografadas: encrypted,
          ativo: payload.data.ativo,
        },
      });

      return res.status(201).json(integrationResponse(integracao));
    } catch (error) {
      return integrationError(res, error, "Nao foi possivel criar a integracao.");
    }
  });

  app.patch("/integracoes/:id", ...requireAdmin, async (req, res) => {
    try {
      const atual = await findIntegrationOrThrow(prisma, req);
      const payload = integrationPayload(req.body, { partial: true });
      const data = { ...payload.data };

      if (payload.credentials) {
        data.credenciaisCriptografadas = encryptCredentials(payload.credentials);
      }

      const integracao = await prisma.integracao.update({
        where: { id: atual.id },
        data,
      });

      return res.json(integrationResponse(integracao));
    } catch (error) {
      return integrationError(res, error, "Nao foi possivel atualizar a integracao.");
    }
  });

  app.post("/integracoes/:id/testar", ...requireAdmin, async (req, res) => {
    try {
      const integracao = await findIntegrationOrThrow(prisma, req);
      const adapter = createIntegrationAdapter(integracao.tipo, safeJson(integracao.configuracaoJson, {}));
      const sync = await prisma.sincronizacaoIntegracao.create({
        data: {
          empresaId: req.auth.empresaId,
          integracaoId: integracao.id,
          status: "EXECUTANDO",
          origem: "MANUAL",
          metadadosJson: JSON.stringify({ acao: "testConnection" }),
        },
      });

      try {
        await adapter.testConnection();
        const updated = await prisma.sincronizacaoIntegracao.update({
          where: { id: sync.id },
          data: { status: "CONCLUIDA", finalizadaEm: new Date() },
        });
        return res.json({ ok: true, sincronizacao: syncResponse(updated) });
      } catch (adapterError) {
        const now = new Date();
        const updated = await prisma.$transaction(async (tx) => {
          const failed = await tx.sincronizacaoIntegracao.update({
            where: { id: sync.id },
            data: {
              status: "FALHOU",
              finalizadaEm: now,
              itensComErro: 1,
              mensagemErro: adapterError.message,
            },
          });
          await tx.erroIntegracao.create({
            data: {
              empresaId: req.auth.empresaId,
              integracaoId: integracao.id,
              sincronizacaoId: failed.id,
              codigo: adapterError.code || "CONNECTOR_ERROR",
              mensagem: adapterError.message,
              detalhesSanitizados: JSON.stringify({ tipo: integracao.tipo }),
            },
          });
          await tx.integracao.update({
            where: { id: integracao.id },
            data: { ultimoErroEm: now, ultimaSincronizacaoEm: now, status: "ERRO" },
          });
          return failed;
        });

        return res.status(501).json({
          erro: adapterError.message,
          codigo: adapterError.code || "CONNECTOR_NOT_IMPLEMENTED",
          sincronizacao: syncResponse(updated),
        });
      }
    } catch (error) {
      return integrationError(res, error, "Nao foi possivel testar a integracao.");
    }
  });

  app.get("/integracoes/:id/sincronizacoes", ...requireAdmin, async (req, res) => {
    try {
      const integracao = await findIntegrationOrThrow(prisma, req);
      const { page, limit, skip } = pagination(req.query);
      const where = { empresaId: req.auth.empresaId, integracaoId: integracao.id };
      const [total, sincronizacoes] = await Promise.all([
        prisma.sincronizacaoIntegracao.count({ where }),
        prisma.sincronizacaoIntegracao.findMany({
          where,
          orderBy: [{ iniciadaEm: "desc" }, { id: "desc" }],
          skip,
          take: limit,
        }),
      ]);
      return res.json(paginated(sincronizacoes.map(syncResponse), total, page, limit));
    } catch (error) {
      return integrationError(res, error, "Nao foi possivel listar sincronizacoes.");
    }
  });

  app.get("/sincronizacoes/:id", ...requireAdmin, async (req, res) => {
    try {
      const id = positiveId(req.params.id);
      if (!id) throw httpError(400, "Sincronizacao invalida.", "SYNC_NOT_FOUND");

      const sync = await prisma.sincronizacaoIntegracao.findFirst({
        where: { id, empresaId: req.auth.empresaId },
        include: { integracao: true, erros: true },
      });
      if (!sync) throw httpError(404, "Sincronizacao nao encontrada.", "SYNC_NOT_FOUND");
      return res.json(syncResponse(sync));
    } catch (error) {
      return integrationError(res, error, "Nao foi possivel buscar a sincronizacao.");
    }
  });

  app.get("/importacoes", ...requireAdmin, async (req, res) => {
    try {
      const { page, limit, skip } = pagination(req.query);
      const where = { empresaId: req.auth.empresaId };
      const [total, importacoes] = await Promise.all([
        prisma.importacaoDados.count({ where }),
        prisma.importacaoDados.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip,
          take: limit,
        }),
      ]);
      return res.json(paginated(importacoes.map(importResponse), total, page, limit));
    } catch (error) {
      return integrationError(res, error, "Nao foi possivel listar importacoes.");
    }
  });

  app.get("/importacoes/:id", ...requireAdmin, async (req, res) => {
    try {
      const id = positiveId(req.params.id);
      if (!id) throw httpError(400, "Importacao invalida.", "IMPORT_NOT_FOUND");
      const importacao = await prisma.importacaoDados.findFirst({
        where: { id, empresaId: req.auth.empresaId },
        include: { erros: true },
      });
      if (!importacao) throw httpError(404, "Importacao nao encontrada.", "IMPORT_NOT_FOUND");
      return res.json(importResponse(importacao));
    } catch (error) {
      return integrationError(res, error, "Nao foi possivel buscar a importacao.");
    }
  });

  app.post("/importacoes/metadados", ...requireAdmin, async (req, res) => {
    try {
      const payload = importMetadataPayload(req.body);
      if (payload.data.integracaoId) {
        await assertIntegrationBelongsToCompany(prisma, payload.data.integracaoId, req.auth.empresaId);
      }

      const importacao = await prisma.importacaoDados.create({
        data: {
          ...payload.data,
          empresaId: req.auth.empresaId,
          createdByUsuarioId: req.auth.usuarioId,
        },
      });
      return res.status(201).json(importResponse(importacao));
    } catch (error) {
      return integrationError(res, error, "Nao foi possivel registrar metadados da importacao.");
    }
  });

  app.get("/hub/produtos", ...requireAdmin, async (req, res) => {
    try {
      const result = await canonicalService.buscarProdutos({
        empresaId: req.auth.empresaId,
        filtros: req.query,
        page: req.query.page,
        limit: req.query.limit,
      });
      return res.json(result);
    } catch (error) {
      return integrationError(res, error, "Nao foi possivel consultar produtos do Hub.");
    }
  });
}

function integrationPayload(body = {}, { partial }) {
  const allowed = ["nome", "tipo", "status", "ativo", "configuracao", "configuracaoJson", "credenciais"];
  const unknown = unknownFields(body, allowed);
  if (unknown.length) throw httpError(400, `Campos nao permitidos: ${unknown.join(", ")}.`, "VALIDATION_ERROR");

  const data = {};
  if (!partial || Object.hasOwn(body, "nome")) {
    const nome = clean(body.nome);
    if (!nome || nome.length > 120) throw httpError(400, "Nome da integracao obrigatorio, com ate 120 caracteres.", "VALIDATION_ERROR");
    data.nome = nome;
  }
  if (!partial || Object.hasOwn(body, "tipo")) {
    const tipo = clean(body.tipo).toUpperCase();
    if (!TIPOS_INTEGRACAO.has(tipo)) throw httpError(400, "Tipo de integracao invalido.", "INTEGRATION_INVALID_TYPE");
    data.tipo = tipo;
  }
  if (Object.hasOwn(body, "status")) {
    const status = clean(body.status).toUpperCase();
    if (!STATUS_INTEGRACAO.has(status)) throw httpError(400, "Status de integracao invalido.", "VALIDATION_ERROR");
    data.status = status;
  } else if (!partial) {
    data.status = "PENDENTE";
  }
  if (Object.hasOwn(body, "ativo")) {
    if (typeof body.ativo !== "boolean") throw httpError(400, "Ativo deve ser booleano.", "VALIDATION_ERROR");
    data.ativo = body.ativo;
  } else if (!partial) {
    data.ativo = true;
  }
  if (Object.hasOwn(body, "configuracao") || Object.hasOwn(body, "configuracaoJson")) {
    data.configuracaoJson = stringifySafeConfig(body.configuracao ?? body.configuracaoJson);
  } else if (!partial) {
    data.configuracaoJson = "{}";
  }

  return { data, credentials: sanitizeCredentialInput(body.credenciais) };
}

function importMetadataPayload(body = {}) {
  const allowed = [
    "integracaoId",
    "formato",
    "nomeArquivo",
    "tamanhoBytes",
    "hashArquivo",
    "tipoEntidade",
    "mapeamento",
    "mapeamentoJson",
    "totalLinhas",
    "linhasValidas",
    "linhasComErro",
  ];
  const unknown = unknownFields(body, allowed);
  if (unknown.length) throw httpError(400, `Campos nao permitidos: ${unknown.join(", ")}.`, "VALIDATION_ERROR");

  const formato = clean(body.formato).toUpperCase();
  if (!FORMATOS_IMPORTACAO.has(formato)) throw httpError(400, "Formato de importacao invalido.", "IMPORT_INVALID_FORMAT");

  const tamanhoBytes = nonNegativeInt(body.tamanhoBytes);
  if (tamanhoBytes === null || tamanhoBytes > MAX_IMPORT_BYTES) {
    throw httpError(400, "Arquivo invalido ou maior que o limite permitido.", "IMPORT_FILE_TOO_LARGE");
  }

  const nomeArquivo = clean(body.nomeArquivo);
  const hashArquivo = clean(body.hashArquivo);
  const tipoEntidade = clean(body.tipoEntidade).toUpperCase();
  if (!nomeArquivo || !hashArquivo || !tipoEntidade) {
    throw httpError(400, "Metadados obrigatorios ausentes.", "VALIDATION_ERROR");
  }

  return {
    data: {
      integracaoId: positiveId(body.integracaoId),
      formato,
      status: "ENVIADO",
      nomeArquivo,
      tamanhoBytes,
      hashArquivo,
      tipoEntidade,
      mapeamentoJson: body.mapeamento || body.mapeamentoJson ? stringifySafeConfig(body.mapeamento ?? body.mapeamentoJson) : null,
      totalLinhas: nonNegativeInt(body.totalLinhas) ?? 0,
      linhasValidas: nonNegativeInt(body.linhasValidas) ?? 0,
      linhasComErro: nonNegativeInt(body.linhasComErro) ?? 0,
    },
  };
}

function integrationWhere(empresaId, query) {
  const where = { empresaId };
  const tipo = clean(query.tipo).toUpperCase();
  const status = clean(query.status).toUpperCase();
  const busca = clean(query.busca || query.search);
  if (tipo) {
    if (!TIPOS_INTEGRACAO.has(tipo)) throw httpError(400, "Tipo de integracao invalido.", "INTEGRATION_INVALID_TYPE");
    where.tipo = tipo;
  }
  if (status) {
    if (!STATUS_INTEGRACAO.has(status)) throw httpError(400, "Status de integracao invalido.", "VALIDATION_ERROR");
    where.status = status;
  }
  if (busca) where.nome = { contains: busca };
  return where;
}

async function findIntegrationOrThrow(prisma, req) {
  const id = positiveId(req.params.id);
  if (!id) throw httpError(400, "Integracao invalida.", "INTEGRATION_NOT_FOUND");
  const integracao = await prisma.integracao.findFirst({
    where: { id, empresaId: req.auth.empresaId },
  });
  if (!integracao) throw httpError(404, "Integracao nao encontrada.", "INTEGRATION_NOT_FOUND");
  return integracao;
}

async function assertIntegrationBelongsToCompany(prisma, integracaoId, empresaId) {
  const integracao = await prisma.integracao.findFirst({
    where: { id: integracaoId, empresaId },
    select: { id: true },
  });
  if (!integracao) throw httpError(404, "Integracao nao encontrada.", "INTEGRATION_NOT_FOUND");
}

function integrationResponse(integracao) {
  return {
    id: integracao.id,
    empresaId: integracao.empresaId,
    nome: integracao.nome,
    tipo: integracao.tipo,
    status: integracao.status,
    modo: integracao.modo,
    configuracao: safeJson(integracao.configuracaoJson, {}),
    possuiCredenciais: hasEncryptedCredentials(integracao.credenciaisCriptografadas),
    ultimaSincronizacaoEm: integracao.ultimaSincronizacaoEm,
    ultimoSucessoEm: integracao.ultimoSucessoEm,
    ultimoErroEm: integracao.ultimoErroEm,
    ativo: integracao.ativo,
    createdAt: integracao.createdAt,
    updatedAt: integracao.updatedAt,
  };
}

function syncResponse(sync) {
  return {
    id: sync.id,
    empresaId: sync.empresaId,
    integracaoId: sync.integracaoId,
    status: sync.status,
    origem: sync.origem,
    iniciadaEm: sync.iniciadaEm,
    finalizadaEm: sync.finalizadaEm,
    itensRecebidos: sync.itensRecebidos,
    itensProcessados: sync.itensProcessados,
    itensComErro: sync.itensComErro,
    mensagemErro: sync.mensagemErro,
    metadados: safeJson(sync.metadadosJson, null),
    erros: sync.erros?.map((erro) => ({
      id: erro.id,
      codigo: erro.codigo,
      mensagem: erro.mensagem,
      resolvido: erro.resolvido,
      createdAt: erro.createdAt,
    })),
    createdAt: sync.createdAt,
    updatedAt: sync.updatedAt,
  };
}

function importResponse(importacao) {
  return {
    id: importacao.id,
    empresaId: importacao.empresaId,
    integracaoId: importacao.integracaoId,
    formato: importacao.formato,
    status: importacao.status,
    nomeArquivo: importacao.nomeArquivo,
    tamanhoBytes: importacao.tamanhoBytes,
    hashArquivo: importacao.hashArquivo,
    tipoEntidade: importacao.tipoEntidade,
    mapeamento: safeJson(importacao.mapeamentoJson, null),
    totalLinhas: importacao.totalLinhas,
    linhasValidas: importacao.linhasValidas,
    linhasComErro: importacao.linhasComErro,
    iniciadaEm: importacao.iniciadaEm,
    finalizadaEm: importacao.finalizadaEm,
    createdByUsuarioId: importacao.createdByUsuarioId,
    createdAt: importacao.createdAt,
    updatedAt: importacao.updatedAt,
    erros: importacao.erros?.map((erro) => ({
      id: erro.id,
      linha: erro.linha,
      campo: erro.campo,
      codigo: erro.codigo,
      mensagem: erro.mensagem,
      valorSanitizado: erro.valorSanitizado,
      createdAt: erro.createdAt,
    })),
  };
}

function integrationError(res, error, fallbackMessage) {
  const status = error.status || statusFromCode(error.code) || 500;
  if (status >= 500 && process.env.NODE_ENV !== "production") {
    console.error(error);
  }
  return res.status(status).json({
    erro: error.message || fallbackMessage,
    codigo: error.code || "INTEGRATION_ERROR",
  });
}

function statusFromCode(code) {
  if (code === "CONNECTOR_NOT_IMPLEMENTED") return 501;
  if (code === "INTEGRATION_NOT_FOUND" || code === "SYNC_NOT_FOUND" || code === "IMPORT_NOT_FOUND") return 404;
  if (code === "INTEGRATION_ACCESS_DENIED") return 403;
  if (code === "INTEGRATION_INVALID_TYPE" || code === "VALIDATION_ERROR" || code?.startsWith("IMPORT_")) return 400;
  if (code === "ENCRYPTION_KEY_REQUIRED") return 500;
  return null;
}

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function stringifySafeConfig(value) {
  if (value === undefined || value === null || value === "") return "{}";
  if (typeof value === "string") {
    JSON.parse(value);
    return value;
  }
  return JSON.stringify(value);
}

function sanitizeCredentialInput(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "Credenciais invalidas.", "INTEGRATION_CREDENTIALS_INVALID");
  }
  return value;
}

function safeJson(value, fallback) {
  try {
    if (value === null || value === undefined || value === "") return fallback;
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function paginated(data, total, page, limit) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

function pagination(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function unknownFields(body, allowed) {
  const allowedSet = new Set(allowed);
  return Object.keys(body || {}).filter((field) => !allowedSet.has(field));
}

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function nonNegativeInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

module.exports = { mountIntegrationHubRoutes };
