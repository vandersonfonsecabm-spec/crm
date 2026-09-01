const { encryptCredentials, hasEncryptedCredentials } = require("./crypto");
const { createIntegrationAdapter } = require("./adapters");
const { createBlingService } = require("./blingService");
const { createCanonicalService } = require("./canonicalService");
const { createCommercialCatalogService } = require("./commercialCatalogService");
const { createWhatsAppFoundationService } = require("./whatsappFoundation");
const { REAL_WHATSAPP_INBOUND_KEY, readGlobalWhatsappConfiguration } = require("../platform/whatsappInboundProvisioning");
const { createMessengerInboundLifecycleService } = require("./messengerInboundLifecycle");
const { createInstagramInboundLifecycleService } = require("./instagramInboundLifecycle");
const { REAL_MESSENGER_INBOUND_KEY, readGlobalMessengerConfiguration } = require("../platform/messengerInboundProvisioning");
const { createMetaCredentialStore } = require("./metaCredentialStore");
const { createMetaOAuthService } = require("./metaOAuthService");
const { FEATURE_KEYS, createTenantFeatureMiddleware } = require("../tenant-features/service");
const {
  createUploadMiddleware,
  analyzeImportFile,
  saveImportCache,
  removeTempFile,
  mapImportacao,
  validateImportacao,
  processImportacao,
  cancelImportacao,
  findPreviousImportByHash,
  importErrorWhere,
} = require("./importService");

const TIPOS_INTEGRACAO = new Set(["BLING", "OMIE", "CONTA_AZUL", "TINY", "ALTERDATA", "CSV", "XLSX", "XML", "JSON", "CUSTOM"]);
const STATUS_INTEGRACAO = new Set(["PENDENTE", "ATIVA", "INATIVA", "ERRO"]);
const FORMATOS_IMPORTACAO = new Set(["CSV", "XLSX", "XML", "JSON"]);
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const MAX_CONFIG_JSON_BYTES = 32 * 1024;
const SENSITIVE_CONFIG_KEY = /(?:api.?key|access.?key|client.?secret|app.?secret|private.?key|access.?token|refresh.?token|auth(?:orization)?|password|passwd|senha|cookie|credential|secret|token)/i;

function mountIntegrationHubRoutes({ app, prisma, authenticate, requireRole }) {
  const requireAdmin = [authenticate, requireRole("ADMIN")];
  const canonicalService = createCanonicalService({ prisma });
  const commercialCatalogService = createCommercialCatalogService({ prisma });
  const blingService = createBlingService({ prisma });
  const metaOAuthService = createMetaOAuthService({ prisma });
  const whatsappFoundationService = createWhatsAppFoundationService({ prisma });
  const messengerInboundLifecycle = createMessengerInboundLifecycleService({ prisma });
  const instagramInboundLifecycle = createInstagramInboundLifecycleService({ prisma });
  const metaCredentialStore = createMetaCredentialStore({ prisma });
  const messengerIntegrationGate = createTenantFeatureMiddleware({
    prisma,
    featureKey: FEATURE_KEYS.MESSENGER_INTEGRATION,
  });
  const whatsappIntegrationGate = createTenantFeatureMiddleware({
    prisma,
    featureKey: FEATURE_KEYS.WHATSAPP_INTEGRATION,
  });
  const uploadImportFile = createUploadMiddleware();

  app.get("/integracoes/whatsapp/status", ...requireAdmin, whatsappIntegrationGate, async (req, res) => {
    try {
      const status = await whatsappFoundationService.getOperationalStatus({ empresaId: req.auth.empresaId });
      return res.json(await withCredentialRevision(prisma, req.auth.empresaId, status, "META_WHATSAPP"));
    } catch (error) {
      return integrationError(res, error, "Não foi possível consultar o estado do WhatsApp.");
    }
  });

  app.post("/integracoes/bling/iniciar", ...requireAdmin, async (req, res) => {
    try {
      assertExternalProviderActivationEnabled();
      const result = await blingService.iniciarOAuth({ auth: req.auth });
      return res.json(result);
    } catch (error) {
      return integrationError(res, error, "Não foi possível iniciar a conexão com o Bling.");
    }
  });

  app.get("/integracoes/bling/callback", async (req, res) => {
    let frontendUrl;
    try { frontendUrl = frontendCallbackBase(process.env); } catch (error) {
      return integrationError(res, error, "Callback do Bling indisponível.");
    }
    try {
      assertExternalProviderActivationEnabled();
      const code = clean(req.query.code);
      const state = clean(req.query.state);
      if (req.query.error) {
        throw httpError(400, clean(req.query.error_description || req.query.error), "BLING_AUTH_DENIED");
      }
      await blingService.concluirOAuth({ code, state });
      return res.redirect(`${frontendUrl}/?bling=conectado`);
    } catch (error) {
      const reason = encodeURIComponent(blingCallbackReason(error.code));
      return res.redirect(`${frontendUrl}/?bling=erro&motivo=${reason}`);
    }
  });

  app.get("/integracoes/messenger/status", ...requireAdmin, messengerIntegrationGate, async (req, res) => {
    try {
      const status = await messengerInboundLifecycle.getStatus({ tenantId: req.auth.empresaId });
      return res.json(await withCredentialRevision(prisma, req.auth.empresaId, status, "META_MESSENGER"));
    } catch (error) {
      return integrationError(res, error, "Não foi possível consultar o estado do Messenger.");
    }
  });

  app.get("/integracoes/instagram/status", ...requireAdmin, async (req, res) => {
    try {
      return res.json(await instagramInboundLifecycle.getStatus({ tenantId: req.auth.empresaId }));
    } catch (error) {
      return integrationError(res, error, "Não foi possível consultar o estado do Instagram.");
    }
  });

  app.post("/integracoes/whatsapp/credentials", ...requireAdmin, whatsappIntegrationGate, async (req, res) => {
    try {
      assertExternalProviderActivationEnabled();
      const credential = await metaCredentialStore.createLocalCredential({
        empresaId: req.auth.empresaId,
        canalIntegracaoId: req.body?.canalIntegracaoId,
        provider: "META_WHATSAPP",
        credentials: req.body?.credentials,
        validateContext: (tx, input) => validateCredentialContext(tx, input, "WHATSAPP", { requireRuntime: true }),
      });
      return res.status(201).json({ stored: true, credential: credentialSummary(credential), nextRequirement: "VALIDATE_WHATSAPP_WEBHOOK" });
    } catch (error) {
      return integrationError(res, error, "Não foi possível armazenar a credencial do WhatsApp com segurança.");
    }
  });

  app.post("/integracoes/messenger/credentials", ...requireAdmin, messengerIntegrationGate, async (req, res) => {
    try {
      assertExternalProviderActivationEnabled();
      const credential = await metaCredentialStore.createLocalCredential({
        empresaId: req.auth.empresaId,
        canalIntegracaoId: req.body?.canalIntegracaoId,
        provider: "META_MESSENGER",
        credentials: req.body?.credentials,
        validateContext: (tx, input) => validateCredentialContext(tx, input, "MESSENGER", { requireRuntime: true }),
      });
      return res.status(201).json({ stored: true, credential: credentialSummary(credential), nextRequirement: "VALIDATE_MESSENGER_WEBHOOK" });
    } catch (error) {
      return integrationError(res, error, "Não foi possível armazenar a credencial do Messenger com segurança.");
    }
  });

  app.put("/integracoes/whatsapp/credentials", ...requireAdmin, whatsappIntegrationGate, async (req, res) => {
    try {
      assertExternalProviderActivationEnabled();
      const credential = await metaCredentialStore.replaceLocalCredential({
        empresaId: req.auth.empresaId,
        canalIntegracaoId: req.body?.canalIntegracaoId,
        provider: "META_WHATSAPP",
        expectedRevision: req.body?.expectedRevision,
        credentials: req.body?.credentials,
        validateContext: (tx, input) => validateCredentialContext(tx, input, "WHATSAPP", { requireRuntime: true }),
      });
      return res.json({ stored: true, replaced: true, credential: credentialSummary(credential), nextRequirement: "VALIDATE_WHATSAPP_WEBHOOK" });
    } catch (error) {
      return integrationError(res, error, "Não foi possível substituir a credencial do WhatsApp com segurança.");
    }
  });

  app.delete("/integracoes/whatsapp/credentials", ...requireAdmin, async (req, res) => {
    try {
      const result = await metaCredentialStore.removeLocalCredential({
        empresaId: req.auth.empresaId,
        canalIntegracaoId: req.body?.canalIntegracaoId,
        provider: "META_WHATSAPP",
        expectedRevision: req.body?.expectedRevision,
        validateContext: (tx, input) => validateCredentialContext(tx, input, "WHATSAPP", { requireRuntime: false }),
      });
      return res.json(result);
    } catch (error) {
      return integrationError(res, error, "Não foi possível remover a credencial do WhatsApp com segurança.");
    }
  });

  app.put("/integracoes/messenger/credentials", ...requireAdmin, messengerIntegrationGate, async (req, res) => {
    try {
      assertExternalProviderActivationEnabled();
      const credential = await metaCredentialStore.replaceLocalCredential({
        empresaId: req.auth.empresaId,
        canalIntegracaoId: req.body?.canalIntegracaoId,
        provider: "META_MESSENGER",
        expectedRevision: req.body?.expectedRevision,
        credentials: req.body?.credentials,
        validateContext: (tx, input) => validateCredentialContext(tx, input, "MESSENGER", { requireRuntime: true }),
      });
      return res.json({ stored: true, replaced: true, credential: credentialSummary(credential), nextRequirement: "VALIDATE_MESSENGER_WEBHOOK" });
    } catch (error) {
      return integrationError(res, error, "Não foi possível substituir a credencial do Messenger com segurança.");
    }
  });

  app.delete("/integracoes/messenger/credentials", ...requireAdmin, async (req, res) => {
    try {
      const result = await metaCredentialStore.removeLocalCredential({
        empresaId: req.auth.empresaId,
        canalIntegracaoId: req.body?.canalIntegracaoId,
        provider: "META_MESSENGER",
        expectedRevision: req.body?.expectedRevision,
        validateContext: (tx, input) => validateCredentialContext(tx, input, "MESSENGER", { requireRuntime: false }),
      });
      return res.json(result);
    } catch (error) {
      return integrationError(res, error, "Não foi possível remover a credencial do Messenger com segurança.");
    }
  });

  app.post("/integracoes/instagram/oauth/iniciar", ...requireAdmin, async (req, res) => {
    try {
      assertExternalProviderActivationEnabled();
      const result = await metaOAuthService.iniciarOAuth({ auth: req.auth, canalIntegracaoId: req.body?.canalIntegracaoId });
      return res.json(result);
    } catch (error) {
      return integrationError(res, error, "Não foi possível iniciar a conexão com o Instagram.");
    }
  });

  app.get("/integracoes/instagram/oauth/callback", async (req, res) => {
    let frontendUrl;
    try { frontendUrl = frontendCallbackBase(process.env); } catch (error) {
      return integrationError(res, error, "Callback do Instagram indisponível.");
    }
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    try {
      assertExternalProviderActivationEnabled();
      await metaOAuthService.concluirOAuth({
        code: req.query.code,
        state: req.query.state,
        error: req.query.error,
        errorDescription: req.query.error_description,
      });
      return res.redirect(`${frontendUrl}/?instagram=conectado`);
    } catch (error) {
      const reason = encodeURIComponent(metaCallbackReason(error.code));
      return res.redirect(`${frontendUrl}/?instagram=erro&motivo=${reason}`);
    }
  });

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
      return integrationError(res, error, "Não foi possível listar integrações.");
    }
  });

  app.get("/integracoes/:id", ...requireAdmin, async (req, res) => {
    try {
      const integracao = await findIntegrationOrThrow(prisma, req);
      return res.json(integrationResponse(integracao));
    } catch (error) {
      return integrationError(res, error, "Não foi possível buscar a integração.");
    }
  });

  app.post("/integracoes", ...requireAdmin, async (req, res) => {
    try {
      const payload = integrationPayload(req.body, { partial: false });
      assertGenericIntegrationLifecycleAllowed(null, payload.data.tipo, req.body);
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
      return integrationError(res, error, "Não foi possível criar a integração.");
    }
  });

  app.patch("/integracoes/:id", ...requireAdmin, async (req, res) => {
    try {
      const atual = await findIntegrationOrThrow(prisma, req);
      const payload = integrationPayload(req.body, { partial: true });
      assertGenericIntegrationLifecycleAllowed(atual.tipo, payload.data.tipo, req.body);
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
      return integrationError(res, error, "Não foi possível atualizar a integração.");
    }
  });

  app.post("/integracoes/:id/testar", ...requireAdmin, async (req, res) => {
    try {
      assertExternalProviderActivationEnabled();
      const integracao = await findIntegrationOrThrow(prisma, req);
      if (integracao.tipo === "BLING") throw httpError(409, "Use a ação dedicada para testar o Bling.", "BLING_LIFECYCLE_REQUIRED");
      const adapter = integracao.tipo === "BLING"
        ? { testConnection: () => blingService.testar({ integracao, empresaId: req.auth.empresaId }) }
        : createIntegrationAdapter(integracao.tipo, safeJson(integracao.configuracaoJson, {}));
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
        const adapterCode = safeAdapterErrorCode(adapterError);
        const adapterMessage = safeAdapterErrorMessage(adapterError);
        const updated = await prisma.$transaction(async (tx) => {
          const failed = await tx.sincronizacaoIntegracao.update({
            where: { id: sync.id },
            data: {
              status: "FALHOU",
              finalizadaEm: now,
              itensComErro: 1,
              mensagemErro: adapterMessage,
            },
          });
          await tx.erroIntegracao.create({
            data: {
              empresaId: req.auth.empresaId,
              integracaoId: integracao.id,
              sincronizacaoId: failed.id,
              codigo: adapterCode,
              mensagem: adapterMessage,
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
          erro: adapterMessage,
          codigo: adapterCode,
          sincronizacao: syncResponse(updated),
        });
      }
    } catch (error) {
      return integrationError(res, error, "Não foi possível testar a integração.");
    }
  });

  app.post("/integracoes/:id/bling/testar", ...requireAdmin, async (req, res) => {
    try {
      assertExternalProviderActivationEnabled();
      const integracao = await findIntegrationOrThrow(prisma, req);
      if (integracao.tipo !== "BLING") throw httpError(400, "Esta ação exige uma integração Bling.", "INTEGRATION_INVALID_TYPE");
      const result = await blingService.testar({ integracao, empresaId: req.auth.empresaId });
      return res.json(result);
    } catch (error) {
      return integrationError(res, error, "Não foi possível testar a conexão Bling.");
    }
  });

  app.post("/integracoes/:id/bling/desconectar", ...requireAdmin, async (req, res) => {
    try {
      assertExternalProviderActivationEnabled();
      const integracao = await findIntegrationOrThrow(prisma, req);
      if (integracao.tipo !== "BLING") throw httpError(400, "Esta ação exige uma integração Bling.", "INTEGRATION_INVALID_TYPE");
      const updated = await blingService.desconectar({ integracao, empresaId: req.auth.empresaId, usuarioId: req.auth.usuarioId });
      return res.json(integrationResponse(updated));
    } catch (error) {
      return integrationError(res, error, "Não foi possível desconectar o Bling.");
    }
  });

  app.post("/integracoes/:id/sincronizar", ...requireAdmin, async (req, res) => {
    try {
      assertExternalProviderActivationEnabled();
      const integracao = await findIntegrationOrThrow(prisma, req);
      const result = await blingService.sincronizar({
        integracao,
        empresaId: req.auth.empresaId,
        entidades: req.body?.entidades,
      });
      return res.json({ sincronizacao: syncResponse(result.sincronizacao), resultado: result.resultado });
    } catch (error) {
      const payload = error.sincronizacao ? { sincronizacao: syncResponse(error.sincronizacao) } : {};
      const status = error.status || statusFromCode(error.code) || 500;
      if (status >= 500) console.error("Falha ao sincronizar integracao.", sanitizedError(error));
      return res.status(status).json({
        erro: status >= 500 ? "Não foi possível sincronizar a integração." : error.message || "Não foi possível sincronizar a integração.",
        codigo: status >= 500 ? "INTEGRATION_SYNC_ERROR" : error.code || "INTEGRATION_SYNC_ERROR",
        ...(status >= 500 ? {} : payload),
      });
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
      return integrationError(res, error, "Não foi possível listar sincronizações.");
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
      if (!sync) throw httpError(404, "Sincronização não encontrada.", "SYNC_NOT_FOUND");
      return res.json(syncResponse(sync));
    } catch (error) {
      return integrationError(res, error, "Não foi possível buscar a sincronização.");
    }
  });

  app.post("/importacoes/upload", ...requireAdmin, (req, res) => {
    uploadImportFile(req, res, async (uploadError) => {
      let tempPath;
      try {
        if (uploadError) {
          throw httpError(400, uploadError.message || "Arquivo inválido.", uploadError.code === "LIMIT_FILE_SIZE" ? "IMPORT_FILE_TOO_LARGE" : "IMPORT_UPLOAD_ERROR");
        }
        tempPath = req.file?.path;
        const tipoEntidade = clean(req.body?.tipoEntidade || "PRODUTOS").toUpperCase();
        if (tipoEntidade !== "PRODUTOS") throw httpError(400, "Tipo de entidade inválido para esta fase.", "IMPORT_INVALID_ENTITY");
        const confirmarReprocessamento = req.body?.confirmarReprocessamento === "true" || req.body?.confirmarReprocessamento === true;
        const analysis = await analyzeImportFile(req.file);
        const previous = await findPreviousImportByHash({ prisma, empresaId: req.auth.empresaId, hashArquivo: analysis.hashArquivo });
        if (previous && !confirmarReprocessamento) {
          return res.status(409).json({
            erro: "Arquivo ja importado anteriormente.",
            codigo: "IMPORT_DUPLICATE_FILE",
            importacaoAnterior: importResponse(previous),
          });
        }

        const importacao = await prisma.importacaoDados.create({
          data: {
            empresaId: req.auth.empresaId,
            createdByUsuarioId: req.auth.usuarioId,
            formato: analysis.formato,
            status: "MAPEAMENTO_PENDENTE",
            nomeArquivo: analysis.nomeArquivo,
            tamanhoBytes: analysis.tamanhoBytes,
            hashArquivo: analysis.hashArquivo,
            tipoEntidade,
            totalLinhas: analysis.totalLinhasEstimado,
          },
        });
        await saveImportCache(importacao.id, {
          columns: analysis.colunasDetectadas,
          duplicateColumns: analysis.colunasDuplicadas,
          rows: analysis.linhas,
          preview: analysis.primeirasLinhas,
          delimiter: analysis.separador,
          sheetName: analysis.planilha,
        });

        return res.status(201).json({
          importacao: importResponse(importacao),
          formato: analysis.formato,
          nomeArquivo: analysis.nomeArquivo,
          tamanhoBytes: analysis.tamanhoBytes,
          hashArquivo: analysis.hashArquivo,
          status: importacao.status,
          colunasDetectadas: analysis.colunasDetectadas,
          colunasDuplicadas: analysis.colunasDuplicadas,
          sugestaoMapeamento: analysis.sugestaoMapeamento,
          primeirasLinhas: analysis.primeirasLinhas,
          totalLinhasEstimado: analysis.totalLinhasEstimado,
          separador: analysis.separador,
          planilha: analysis.planilha,
        });
      } catch (error) {
        return integrationError(res, error, "Não foi possível analisar o arquivo.");
      } finally {
        if (tempPath) {
          try { await removeTempFile(tempPath); } catch (cleanupError) { if (process.env.NODE_ENV !== "production") console.error(cleanupError); }
        }
      }
    });
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
      return integrationError(res, error, "Não foi possível listar importações.");
    }
  });

  app.post("/importacoes/:id/mapear", ...requireAdmin, async (req, res) => {
    try {
      const importacao = await findImportacaoOrThrow(prisma, req);
      const result = await mapImportacao({ prisma, importacao, empresaId: req.auth.empresaId, body: req.body });
      return res.json({
        importacao: importResponse(result.importacao),
        previa: result.previa,
        errosConfiguracao: result.errosConfiguracao,
        avisos: result.avisos,
        linhasValidasEstimadas: result.linhasValidasEstimadas,
        linhasInvalidasEstimadas: result.linhasInvalidasEstimadas,
      });
    } catch (error) {
      return integrationError(res, error, "Não foi possível salvar o mapeamento.");
    }
  });

  app.post("/importacoes/:id/validar", ...requireAdmin, async (req, res) => {
    try {
      const importacao = await findImportacaoOrThrow(prisma, req);
      const result = await validateImportacao({ prisma, importacao, empresaId: req.auth.empresaId });
      return res.json({ importacao: importResponse(result.importacao), resumo: result.resumo });
    } catch (error) {
      return integrationError(res, error, "Não foi possível validar a importação.");
    }
  });

  app.post("/importacoes/:id/processar", ...requireAdmin, async (req, res) => {
    try {
      const importacao = await findImportacaoOrThrow(prisma, req);
      const result = await processImportacao({ prisma, importacao, empresaId: req.auth.empresaId, usuarioId: req.auth.usuarioId, body: req.body });
      return res.json({ importacao: importResponse(result.importacao), resultado: result.resultado });
    } catch (error) {
      return integrationError(res, error, "Não foi possível processar a importação.");
    }
  });

  app.post("/importacoes/:id/cancelar", ...requireAdmin, async (req, res) => {
    try {
      const importacao = await findImportacaoOrThrow(prisma, req);
      const updated = await cancelImportacao({ prisma, importacao, empresaId: req.auth.empresaId });
      return res.json(importResponse(updated));
    } catch (error) {
      return integrationError(res, error, "Não foi possível cancelar a importação.");
    }
  });

  app.get("/importacoes/:id/erros", ...requireAdmin, async (req, res) => {
    try {
      const importacao = await findImportacaoOrThrow(prisma, req);
      const { page, limit, skip } = pagination(req.query);
      const where = importErrorWhere(importacao.id, req.query);
      const [total, erros] = await Promise.all([
        prisma.erroImportacao.count({ where }),
        prisma.erroImportacao.findMany({ where, orderBy: [{ linha: "asc" }, { id: "asc" }], skip, take: limit }),
      ]);
      return res.json(paginated(erros.map(importErrorResponse), total, page, limit));
    } catch (error) {
      return integrationError(res, error, "Não foi possível listar erros da importação.");
    }
  });
  app.get("/importacoes/:id", ...requireAdmin, async (req, res) => {
    try {
      const id = positiveId(req.params.id);
      if (!id) throw httpError(400, "Importação inválida.", "IMPORT_NOT_FOUND");
      const importacao = await prisma.importacaoDados.findFirst({
        where: { id, empresaId: req.auth.empresaId },
        include: { erros: true, integracao: true, createdByUsuario: true },
      });
      if (!importacao) throw httpError(404, "Importação não encontrada.", "IMPORT_NOT_FOUND");
      return res.json(importResponse(importacao));
    } catch (error) {
      return integrationError(res, error, "Não foi possível buscar a importação.");
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
      return integrationError(res, error, "Não foi possível registrar metadados da importação.");
    }
  });

  app.get("/hub/consulta-comercial", ...requireAdmin, async (req, res) => {
    try {
      const result = await commercialCatalogService.consultarCatalogoComercial({
        empresaId: req.auth.empresaId,
        filtros: req.query,
      });
      return res.json(result);
    } catch (error) {
      return integrationError(res, error, "Não foi possível consultar o catálogo comercial.");
    }
  });

  app.get("/hub/qualidade-dados", ...requireAdmin, async (req, res) => {
    try {
      const result = await commercialCatalogService.qualidadeDados({ empresaId: req.auth.empresaId });
      return res.json(result);
    } catch (error) {
      return integrationError(res, error, "Não foi possível consultar a qualidade dos dados.");
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
      return integrationError(res, error, "Não foi possível consultar produtos do Hub.");
    }
  });
}

function integrationPayload(body = {}, { partial }) {
  const allowed = ["nome", "tipo", "status", "ativo", "configuracao", "configuracaoJson", "credenciais"];
  const unknown = unknownFields(body, allowed);
  if (unknown.length) throw httpError(400, `Campos não permitidos: ${unknown.join(", ")}.`, "VALIDATION_ERROR");

  const data = {};
  if (!partial || Object.hasOwn(body, "nome")) {
    const nome = clean(body.nome);
    if (!nome || nome.length > 120) throw httpError(400, "Nome da integração obrigatório, com até 120 caracteres.", "VALIDATION_ERROR");
    data.nome = nome;
  }
  if (!partial || Object.hasOwn(body, "tipo")) {
    const tipo = clean(body.tipo).toUpperCase();
    if (!TIPOS_INTEGRACAO.has(tipo)) throw httpError(400, "Tipo de integração inválido.", "INTEGRATION_INVALID_TYPE");
    data.tipo = tipo;
  }
  if (Object.hasOwn(body, "status")) {
    const status = clean(body.status).toUpperCase();
    if (!STATUS_INTEGRACAO.has(status)) throw httpError(400, "Status de integração inválido.", "VALIDATION_ERROR");
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
  if (unknown.length) throw httpError(400, `Campos não permitidos: ${unknown.join(", ")}.`, "VALIDATION_ERROR");

  const formato = clean(body.formato).toUpperCase();
  if (!FORMATOS_IMPORTACAO.has(formato)) throw httpError(400, "Formato de importação inválido.", "IMPORT_INVALID_FORMAT");

  const tamanhoBytes = nonNegativeInt(body.tamanhoBytes);
  if (tamanhoBytes === null || tamanhoBytes > MAX_IMPORT_BYTES) {
    throw httpError(400, "Arquivo inválido ou maior que o limite permitido.", "IMPORT_FILE_TOO_LARGE");
  }

  const nomeArquivo = clean(body.nomeArquivo);
  const hashArquivo = clean(body.hashArquivo);
  const tipoEntidade = clean(body.tipoEntidade).toUpperCase();
  if (!nomeArquivo || !hashArquivo || !tipoEntidade) {
    throw httpError(400, "Metadados obrigatórios ausentes.", "VALIDATION_ERROR");
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
    if (!TIPOS_INTEGRACAO.has(tipo)) throw httpError(400, "Tipo de integração inválido.", "INTEGRATION_INVALID_TYPE");
    where.tipo = tipo;
  }
  if (status) {
    if (!STATUS_INTEGRACAO.has(status)) throw httpError(400, "Status de integração inválido.", "VALIDATION_ERROR");
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
  if (!integracao) throw httpError(404, "Integração não encontrada.", "INTEGRATION_NOT_FOUND");
  return integracao;
}

async function assertIntegrationBelongsToCompany(prisma, integracaoId, empresaId) {
  const integracao = await prisma.integracao.findFirst({
    where: { id: integracaoId, empresaId },
    select: { id: true },
  });
  if (!integracao) throw httpError(404, "Integração não encontrada.", "INTEGRATION_NOT_FOUND");
}

async function findImportacaoOrThrow(prisma, req) {
  const id = positiveId(req.params.id);
  if (!id) throw httpError(400, "Importação inválida.", "IMPORT_NOT_FOUND");
  const importacao = await prisma.importacaoDados.findFirst({
    where: { id, empresaId: req.auth.empresaId },
    include: { erros: true, integracao: true, createdByUsuario: true },
  });
  if (!importacao) throw httpError(404, "Importação não encontrada.", "IMPORT_NOT_FOUND");
  return importacao;
}

function integrationResponse(integracao) {
  return {
    id: integracao.id,
    empresaId: integracao.empresaId,
    nome: integracao.nome,
    tipo: integracao.tipo,
    status: integracao.status,
    modo: integracao.modo,
    configuracao: redactSensitiveConfig(safeJson(integracao.configuracaoJson, {})),
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
    mensagemErro: redactSensitiveText(sync.mensagemErro),
    metadados: redactSensitiveConfig(safeJson(sync.metadadosJson, null)),
    erros: sync.erros?.map((erro) => ({
      id: erro.id,
      codigo: erro.codigo,
      mensagem: redactSensitiveText(erro.mensagem),
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
    hashArquivo: partialHash(importacao.hashArquivo),
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
    integracao: importacao.integracao ? { id: importacao.integracao.id, nome: importacao.integracao.nome, tipo: importacao.integracao.tipo } : null,
    usuario: importacao.createdByUsuario ? { id: importacao.createdByUsuario.id, nome: importacao.createdByUsuario.nome, email: importacao.createdByUsuario.email } : null,
    erros: importacao.erros?.map(importErrorResponse),
  };
}

function importErrorResponse(erro) {
  return {
      id: erro.id,
      linha: erro.linha,
      campo: erro.campo,
      codigo: erro.codigo,
      mensagem: erro.mensagem,
      valorSanitizado: erro.valorSanitizado,
      createdAt: erro.createdAt,
    };
}

function partialHash(hash) {
  if (!hash) return null;
  return `${String(hash).slice(0, 12)}...${String(hash).slice(-8)}`;
}



function integrationError(res, error, fallbackMessage) {
  const code = error?.code || error?.codigo;
  const status = error.status || statusFromCode(code) || 500;
  if (status >= 500) console.error(fallbackMessage, sanitizedError(error));
  return res.status(status).json({
    erro: status >= 500 ? fallbackMessage : error.message || fallbackMessage,
    codigo: status >= 500 ? "INTEGRATION_ERROR" : code || "INTEGRATION_ERROR",
  });
}

function sanitizedError(error) {
  if (!error) return null;
  return { name: error.name, code: error.code || error.codigo };
}

function statusFromCode(code) {
  if (code === "PROVIDER_ACTIVATION_PAUSED") return 503;
  if (code === "BLING_OAUTH_REQUIRED" || code === "BLING_LIFECYCLE_REQUIRED" || code === "INTEGRATION_OPERATION_IN_PROGRESS") return 409;
  if (code === "CONNECTOR_NOT_IMPLEMENTED") return 501;
  if (code === "BLING_NOT_CONFIGURED") return 501;
  if (code === "BLING_CREDENTIALS_REQUIRED" || code === "BLING_INVALID_STATE" || code === "BLING_AUTH_CODE_REQUIRED") return 400;
  if (["BLING_TOKEN_ERROR", "BLING_TOKEN_RESPONSE_INVALID", "BLING_HTTP_ERROR", "BLING_TIMEOUT"].includes(code)) return 502;
  if (code === "INTEGRATION_NOT_FOUND" || code === "SYNC_NOT_FOUND" || code === "IMPORT_NOT_FOUND") return 404;
  if (["IMPORT_DUPLICATE_FILE", "IMPORT_INVALID_STATUS", "IMPORT_CONFIRMATION_REQUIRED", "IMPORT_CONFLICT"].includes(code)) return 409;
  if (code === "IMPORT_CACHE_EXPIRED") return 410;
  if (code === "INTEGRATION_ACCESS_DENIED") return 403;
  if (code === "INTEGRATION_INVALID_TYPE" || code === "VALIDATION_ERROR" || code?.startsWith("IMPORT_")) return 400;
  if (code === "ENCRYPTION_KEY_REQUIRED") return 500;
  if (["META_CHANNEL_INVALID", "META_CALLBACK_INVALID", "META_AUTH_DENIED", "META_AUTH_CODE_REQUIRED", "META_INVALID_STATE", "META_CONFIG_INVALID", "META_REDIRECT_URI_INVALID", "META_CREDENTIAL_PROVIDER_UNSUPPORTED"].includes(code)) return 400;
  if (["META_CHANNEL_NOT_FOUND", "META_CREDENTIAL_NOT_FOUND"].includes(code)) return 404;
  if (code === "META_OAUTH_FORBIDDEN") return 403;
  if (["META_EXTERNAL_NETWORK_DISABLED", "META_RESPONSE_INVALID", "META_TOKEN_RESPONSE_INVALID", "META_SUBSCRIPTION_FAILED"].includes(code)) return 503;
  return null;
}

async function validateCredentialContext(tx, { empresaId, canalIntegracaoId, channel }, provider, { requireRuntime = true } = {}) {
  const isWhatsapp = provider === "WHATSAPP";
  const expected = isWhatsapp
    ? {
        type: "WHATSAPP_META",
        key: REAL_WHATSAPP_INBOUND_KEY,
        flags: ["WHATSAPP_INTEGRATION", "WHATSAPP_INBOUND"],
        identity: () => typeof channel.wabaId === "string" && channel.wabaId.length > 0 && typeof channel.phoneNumberId === "string" && channel.phoneNumberId.length > 0,
        configuration: readGlobalWhatsappConfiguration,
      }
    : {
        type: "MESSENGER_META",
        key: REAL_MESSENGER_INBOUND_KEY,
        flags: ["MESSENGER_INTEGRATION", "MESSENGER_INBOUND"],
        identity: () => typeof channel.messengerPageId === "string" && channel.messengerPageId.length > 0,
        configuration: readGlobalMessengerConfiguration,
      };
  if (!requireRuntime) {
    if (channel.tipo !== expected.type || channel.chaveInterna !== expected.key || channel.modoTeste !== false) {
      throw httpError(409, "O canal nao corresponde ao provider autorizado.", "META_CREDENTIAL_CHANNEL_MISMATCH");
    }
    return true;
  }
  if (channel.tipo !== expected.type || channel.chaveInterna !== expected.key || channel.modoTeste !== false || channel.ativo !== true || channel.status !== "ATIVO" || !expected.identity()) {
    throw httpError(409, "O canal nao esta em estado seguro para receber credencial.", "META_CREDENTIAL_CHANNEL_NOT_READY");
  }
  if (requireRuntime) {
    let global;
    try { global = expected.configuration(process.env); } catch { throw httpError(503, "A configuracao server-side do provider esta incompleta.", "META_PROVIDER_CONFIGURATION_REQUIRED"); }
    const integrationFlag = isWhatsapp ? "WHATSAPP_INTEGRATION_ENABLED" : "MESSENGER_INTEGRATION_ENABLED";
    const inboundFlag = isWhatsapp ? "WHATSAPP_INBOUND_ENABLED" : "MESSENGER_INBOUND_ENABLED";
    const appSecret = isWhatsapp ? process.env.WHATSAPP_APP_SECRET : process.env.MESSENGER_APP_SECRET;
    const verifyToken = isWhatsapp ? process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN : process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN;
    if (process.env[integrationFlag] !== "true" || process.env[inboundFlag] !== "true" || !hasConfiguredSecret(appSecret) || !hasConfiguredSecret(verifyToken)) {
      throw httpError(503, "O provider ainda nao possui configuracao server-side completa.", "META_PROVIDER_CONFIGURATION_REQUIRED");
    }
    if (channel.metaAppId !== global.metaAppId || channel.providerEnvironment !== global.providerEnvironment) {
      throw httpError(409, "A identidade do canal nao corresponde a configuracao server-side.", "META_CREDENTIAL_CONFIGURATION_MISMATCH");
    }
  }
  const features = await tx.empresaFuncionalidade.findMany({
    where: { empresaId, chave: { in: expected.flags }, habilitada: true },
    select: { chave: true },
  });
  if (new Set(features.map((row) => row.chave)).size !== expected.flags.length) {
    throw httpError(403, "A capacidade do provider ainda nao esta habilitada para este tenant.", "META_CREDENTIAL_CAPABILITY_REQUIRED");
  }
  return true;
}

async function withCredentialRevision(prisma, empresaId, status, provider) {
  if (!status?.credentialConfigured || !status.canalIntegracaoId || !empresaId) {
    return { ...status, credentialRevision: null };
  }
  const channel = await prisma.canalIntegracao.findFirst({
    where: { id: status.canalIntegracaoId, empresaId },
    select: { accessTokenRef: true },
  });
  if (!channel?.accessTokenRef) return { ...status, credentialRevision: null };
  const credential = await prisma.metaCredential.findFirst({
    where: { empresaId, canalIntegracaoId: status.canalIntegracaoId, provider, reference: channel.accessTokenRef, status: "ATIVA" },
    select: { revision: true },
  });
  return { ...status, credentialRevision: credential?.revision || null };
}

function credentialSummary(credential) {
  return {
    provider: credential?.provider || null,
    status: credential?.status || null,
    revision: credential?.revision || null,
  };
}

function hasConfiguredSecret(value) {
  return typeof value === "string" && value.trim().length >= 8;
}

function blingCallbackReason(code) {
  if (code === "BLING_NOT_CONFIGURED") return "configuracao";
  if (code === "BLING_AUTH_DENIED" || code === "BLING_AUTH_CODE_REQUIRED") return "autorizacao";
  if (code === "BLING_INVALID_STATE") return "state";
  if (code === "BLING_TOKEN_ERROR") return "token";
  return "conexao";
}

function metaCallbackReason(code) {
  if (code === "META_AUTH_DENIED") return "autorizacao";
  if (code === "META_AUTH_CODE_REQUIRED") return "codigo";
  if (code === "META_INVALID_STATE") return "state";
  if (code === "META_EXTERNAL_NETWORK_DISABLED") return "transporte_desativado";
  if (code === "META_CONFIG_INVALID") return "configuracao";
  return "conexao";
}

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function stringifySafeConfig(value) {
  if (value === undefined || value === null || value === "") return "{}";
  let parsed;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw httpError(400, "Configuração inválida.", "INTEGRATION_CONFIG_INVALID");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw httpError(400, "Configuração deve ser um objeto JSON.", "INTEGRATION_CONFIG_INVALID");
  }
  assertNoSensitiveConfigKeys(parsed);
  assertNoSensitiveConfigValues(parsed);
  const serialized = JSON.stringify(parsed);
  if (Buffer.byteLength(serialized, "utf8") > MAX_CONFIG_JSON_BYTES) {
    throw httpError(400, "Configuração excede o limite permitido.", "INTEGRATION_CONFIG_INVALID");
  }
  return serialized;
}

function assertExternalProviderActivationEnabled(env = process.env) {
  const configured = env.EXTERNAL_PROVIDER_ACTIVATION_ENABLED;
  const enabled = String(configured || "").trim().toLowerCase() === "true";
  const explicitlyDisabled = configured !== undefined && !enabled;
  if ((env.NODE_ENV === "production" || explicitlyDisabled) && !enabled) {
    throw httpError(503, "A ativação externa está pausada nesta fase.", "PROVIDER_ACTIVATION_PAUSED");
  }
  return true;
}

function assertNoSensitiveConfigValues(value, depth = 0) {
  if (depth > 8) throw httpError(400, "Configuração profunda demais.", "INTEGRATION_CONFIG_INVALID");
  if (typeof value === "string") {
    const sensitiveValue = /(?:^|\s)(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+|[?&](?:api_key|client_secret|access_token|refresh_token|token)=[^&\s]+|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
    if (sensitiveValue.test(value)) {
      throw httpError(400, "Configuração contém valor sensível; use o armazenamento cifrado de credenciais.", "INTEGRATION_CONFIG_SENSITIVE_FIELD");
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) assertNoSensitiveConfigValues(child, depth + 1);
}

function assertGenericIntegrationLifecycleAllowed(currentType, requestedType, body = {}) {
  const nextType = requestedType || currentType;
  if (currentType !== "BLING" && nextType !== "BLING") return true;
  if (!currentType && nextType === "BLING") {
    throw httpError(409, "A integração Bling deve ser criada pelo fluxo OAuth dedicado.", "BLING_OAUTH_REQUIRED");
  }
  const allowedRenameOnly = currentType === "BLING"
    && nextType === "BLING"
    && Object.keys(body).every((field) => field === "nome");
  if (!allowedRenameOnly) {
    throw httpError(409, "O ciclo operacional do Bling deve usar as ações dedicadas.", "BLING_LIFECYCLE_REQUIRED");
  }
  return true;
}

function frontendCallbackBase(env = process.env) {
  const raw = String(env.FRONTEND_URL || "").split(",")[0].trim();
  if (!raw) throw httpError(503, "Frontend de callback não configurado.", "PROVIDER_FRONTEND_URL_REQUIRED");
  let url;
  try { url = new URL(raw); } catch { throw httpError(503, "Frontend de callback inválido.", "PROVIDER_FRONTEND_URL_INVALID"); }
  const localDevelopment = env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!localDevelopment && url.protocol !== "https:") || (localDevelopment && !["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.search || url.hash) {
    throw httpError(503, "Frontend de callback inválido.", "PROVIDER_FRONTEND_URL_INVALID");
  }
  return url.origin;
}

function assertNoSensitiveConfigKeys(value, depth = 0) {
  if (depth > 8) throw httpError(400, "Configuração profunda demais.", "INTEGRATION_CONFIG_INVALID");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_CONFIG_KEY.test(normalizeSensitiveKey(key))) {
      throw httpError(400, "Configuração contém campo sensível; use o armazenamento cifrado de credenciais.", "INTEGRATION_CONFIG_SENSITIVE_FIELD");
    }
    assertNoSensitiveConfigKeys(child, depth + 1);
  }
}

function redactSensitiveConfig(value, depth = 0) {
  if (depth > 8) return "[redacted]";
  if (typeof value === "string") return redactSensitiveText(value);
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactSensitiveConfig(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    SENSITIVE_CONFIG_KEY.test(normalizeSensitiveKey(key)) ? "[redacted]" : redactSensitiveConfig(child, depth + 1),
  ]));
}

function normalizeSensitiveKey(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function safeAdapterErrorCode(error) {
  const code = String(error?.code || error?.codigo || "CONNECTOR_ERROR").trim().toUpperCase();
  return /^[A-Z0-9_]{2,80}$/.test(code) ? code : "CONNECTOR_ERROR";
}

function safeAdapterErrorMessage(error) {
  const code = safeAdapterErrorCode(error);
  if (code === "BLING_CREDENTIALS_REQUIRED") return "Credenciais do Bling ausentes.";
  if (code === "BLING_NOT_CONFIGURED") return "Bling não configurado.";
  if (code === "CONNECTOR_NOT_IMPLEMENTED") return "Conector não implementado.";
  return "Não foi possível testar a integração.";
}

function redactSensitiveText(value) {
  if (value === undefined || value === null || value === "") return value ?? null;
  return String(value)
    .replace(/(authorization\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/gi, "$1[redacted]")
    .replace(/((?:api[_-]?key|client[_-]?secret|app[_-]?secret|access[_-]?token|refresh[_-]?token|password|senha|token)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/([?&](?:api_key|client_secret|access_token|refresh_token|token)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .slice(0, 500);
}

function sanitizeCredentialInput(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "Credenciais inválidas.", "INTEGRATION_CREDENTIALS_INVALID");
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

module.exports = {
  mountIntegrationHubRoutes,
  _private: {
    integrationError,
    stringifySafeConfig,
    redactSensitiveConfig,
    safeAdapterErrorMessage,
    redactSensitiveText,
    assertExternalProviderActivationEnabled,
    assertGenericIntegrationLifecycleAllowed,
    frontendCallbackBase,
  },
};


