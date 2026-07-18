const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { after, afterEach, before, beforeEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(requiredEnv("CRM_PRISMA_TEST_RUN_DIR"), "whatsapp-f1a2");
const databasePath = path.join(auditDir, `whatsapp-f1a2-${process.pid}.db`);
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");
const jwtSecret = crypto.randomBytes(48).toString("hex");

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: "1h",
  ALLOW_COMPANY_REGISTRATION: "true",
  INTEGRATION_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"),
  DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
  CRM_TEST_DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
  WHATSAPP_INTEGRATION_ENABLED: "false",
  WHATSAPP_INBOUND_ENABLED: "false",
});
delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
delete process.env.WHATSAPP_APP_SECRET;

const webhook = require("../src/integrations/whatsappWebhook");

let api;
let prisma;
let server;
let baseUrl;
let verifyToken;
let appSecret;

before(async () => {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.copyFileSync(sourceDatabase, databasePath);
  api = require("../src/server");
  prisma = api.prisma;
  await new Promise((resolve) => {
    server = api.app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  verifyToken = crypto.randomBytes(32).toString("base64url");
  appSecret = crypto.randomBytes(32).toString("hex");
  process.env.WHATSAPP_INTEGRATION_ENABLED = "false";
  process.env.WHATSAPP_INBOUND_ENABLED = "false";
  process.env.LEADS_COMMUNICATION_ENABLED = "false";
  process.env.SITE_LEAD_CAPTURE_ENABLED = "false";
  delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
});

afterEach(() => {
  process.env.WHATSAPP_INTEGRATION_ENABLED = "false";
  process.env.WHATSAPP_INBOUND_ENABLED = "false";
  process.env.LEADS_COMMUNICATION_ENABLED = "false";
  process.env.SITE_LEAD_CAPTURE_ENABLED = "false";
  delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
  removeDatabase(databasePath);
});

test("helpers usam comparacao constante e validam assinatura sem ambiguidades", () => {
  assert.equal(webhook.safeSecretEqual("mesmo", "mesmo"), true);
  assert.equal(webhook.safeSecretEqual("valor-curto", "valor-com-tamanho-diferente"), false);
  assert.equal(webhook.safeSecretEqual("valor-a", "valor-b"), false);

  const rawBody = Buffer.from('{"object":"whatsapp_business_account","entry":[]}', "utf8");
  const signature = sign(rawBody);
  assert.equal(webhook.isValidHmacSignature(rawBody, signature, appSecret), true);
  assert.equal(webhook.isValidHmacSignature(Buffer.concat([rawBody, Buffer.from(" ")]), signature, appSecret), false);
  assert.equal(webhook.parseSignatureHeader(signature.slice(7)), null);
  assert.equal(webhook.parseSignatureHeader("sha1=" + "a".repeat(64)), null);
  assert.equal(webhook.parseSignatureHeader("sha256=" + "z".repeat(64)), null);
  assert.equal(webhook.parseSignatureHeader(`${signature},${signature}`), null);

  const duplicated = { rawHeaders: ["X-Hub-Signature-256", signature, "x-hub-signature-256", signature] };
  assert.equal(webhook.readSingleHeader(duplicated, "x-hub-signature-256"), null);
  assert.equal(webhook.readVerificationQuery({
    "hub.mode": ["subscribe"],
    "hub.verify_token": "x",
    "hub.challenge": "y",
  }), null);
  assert.equal(webhook.readVerificationQuery({
    "hub.mode": { value: "subscribe" },
    "hub.verify_token": "x",
    "hub.challenge": "y",
  }), null);
});

test("GET permanece oculto sem gate e valida somente os parametros exatos", async () => {
  const query = verificationQuery(verifyToken, "challenge-exato");
  assert.equal((await request("GET", `/webhooks/whatsapp?${query}`)).status, 404);

  process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
  assert.equal((await request("GET", `/webhooks/whatsapp?${query}`)).status, 404);
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = verifyToken;

  assert.equal((await request("GET", "/webhooks/whatsapp")).status, 400);
  assert.equal((await request("GET", `/webhooks/whatsapp?${query}&hub.mode=subscribe`)).status, 400);
  assert.equal((await request("GET", `/webhooks/whatsapp?hub.mode[x]=subscribe&hub.verify_token=x&hub.challenge=y`)).status, 400);
  assert.equal((await request("GET", `/webhooks/whatsapp?mode=subscribe&hub.verify_token=x&hub.challenge=y`)).status, 400);
  assert.equal((await request("GET", `/webhooks/whatsapp?${verificationQuery(verifyToken, "x", "other")}`)).status, 403);
  assert.equal((await request("GET", `/webhooks/whatsapp?${verificationQuery("incorreto", "x")}`)).status, 403);

  const accepted = await request("GET", `/webhooks/whatsapp?${query}`);
  assert.equal(accepted.status, 200);
  assert.match(accepted.contentType, /^text\/plain/);
  assert.equal(accepted.text, "challenge-exato");
});

test("POST aplica gates, raw body, tipo, limite, assinatura e envelope", async () => {
  const validBody = Buffer.from('{"object":"whatsapp_business_account","entry":[]}', "utf8");
  assert.equal((await rawRequest(validBody)).status, 404);

  process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
  process.env.WHATSAPP_INBOUND_ENABLED = "true";
  assert.equal((await rawRequest(validBody)).status, 404);
  process.env.WHATSAPP_APP_SECRET = appSecret;

  assert.equal((await rawRequest(validBody, { contentType: "text/plain", signature: sign(validBody) })).status, 415);
  assert.equal((await rawRequest(validBody, { contentType: "application/json; charset=latin1", signature: sign(validBody) })).status, 415);
  assert.equal((await rawRequest(Buffer.alloc(0), { signature: sign(Buffer.alloc(0)) })).status, 400);
  assert.equal((await rawRequest(Buffer.alloc(webhook.MAX_WEBHOOK_BODY_BYTES + 1), { signature: "sha256=" + "0".repeat(64) })).status, 413);
  assert.equal((await rawRequest(validBody)).status, 401);
  assert.equal((await rawRequest(validBody, { signature: "sha256=invalida" })).status, 401);
  assert.equal((await rawRequest(validBody, { signature: "sha256=" + "0".repeat(64) })).status, 401);

  const invalidJson = Buffer.from("{", "utf8");
  assert.equal((await rawRequest(invalidJson, { signature: sign(invalidJson) })).status, 400);
  const invalidEnvelope = Buffer.from('{"object":"outro","entry":[]}', "utf8");
  assert.equal((await rawRequest(invalidEnvelope, { signature: sign(invalidEnvelope) })).status, 400);

  const accepted = await rawRequest(validBody, { signature: sign(validBody) });
  assert.equal(accepted.status, 422);
  assert.deepEqual(accepted.body, {
    erro: "Requisicao nao aceita.",
    codigo: "WEBHOOK_EVENT_UNSUPPORTED",
  });
});

test("respostas e logs nao expoem segredos, assinatura ou payload", async () => {
  process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
  process.env.WHATSAPP_INBOUND_ENABLED = "true";
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = verifyToken;
  process.env.WHATSAPP_APP_SECRET = appSecret;
  const rawBody = Buffer.from('{"object":"whatsapp_business_account","entry":[],"sensitive":"nao-expor"}', "utf8");
  const signature = sign(rawBody);
  const captured = [];
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const method of Object.keys(original)) console[method] = (...args) => captured.push(args.join(" "));

  try {
    const getResponse = await request("GET", `/webhooks/whatsapp?${verificationQuery("token-invalido", "x")}`);
    const postResponse = await rawRequest(rawBody, { signature: signature.slice(0, -1) + "0" });
    const serialized = `${getResponse.text}${postResponse.text}${captured.join("\n")}`;
    for (const forbidden of [verifyToken, appSecret, signature, "sensitive", "nao-expor"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
    assert.deepEqual(captured, []);
  } finally {
    Object.assign(console, original);
  }
});

test("parser raw fica isolado e regressao JSON, health, Site Form e gate ADMIN permanece", async () => {
  process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
  process.env.WHATSAPP_INBOUND_ENABLED = "true";
  process.env.WHATSAPP_APP_SECRET = appSecret;
  const rawBody = Buffer.from('{"object":"whatsapp_business_account","entry":[]}', "utf8");
  assert.equal((await rawRequest(rawBody, { signature: sign(rawBody) })).status, 422);

  const loginValidation = await request("POST", "/auth/login", { body: {} });
  assert.equal(loginValidation.status, 401);
  const health = await request("GET", "/health");
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { status: "ok", service: "crm-agro-api" });
  process.env.LEADS_COMMUNICATION_ENABLED = "true";
  process.env.SITE_LEAD_CAPTURE_ENABLED = "true";
  assert.equal((await request("POST", "/public/site-leads/inexistente", { body: {} })).status, 404);
  process.env.LEADS_COMMUNICATION_ENABLED = "false";
  process.env.SITE_LEAD_CAPTURE_ENABLED = "false";

  process.env.WHATSAPP_INTEGRATION_ENABLED = "false";
  let usuario = await prisma.usuario.findFirst({ where: { ativo: true }, select: { id: true, empresaId: true, papel: true } });
  if (!usuario) {
    const empresa = await prisma.empresa.create({
      data: { nome: "Empresa webhook F1A2", slug: "empresa-webhook-f1a2" },
    });
    usuario = await prisma.usuario.create({
      data: {
        empresaId: empresa.id,
        nome: "Admin webhook F1A2",
        email: "admin-webhook-f1a2@example.test",
        senhaHash: "hash-ficticio",
        papel: "ADMIN",
      },
      select: { id: true, empresaId: true, papel: true },
    });
  }
  const token = jwt.sign(
    { empresaId: usuario.empresaId, papel: usuario.papel },
    jwtSecret,
    {
      subject: String(usuario.id),
      expiresIn: "5m",
      issuer: "crm-agro-saas-api",
      audience: "crm-agro-saas",
    },
  );
  assert.equal((await request("GET", "/integracoes/whatsapp/status", { token })).status, 404);

  const serverSource = fs.readFileSync(path.join(backendDir, "src", "server.js"), "utf8");
  const mountPosition = serverSource.indexOf("mountWhatsAppWebhookRoutes({ app, processWebhook:");
  const jsonPosition = serverSource.indexOf("app.use(express.json())");
  assert.ok(mountPosition > 0 && mountPosition < jsonPosition);
  assert.equal(serverSource.match(/mountWhatsAppWebhookRoutes\(\{ app, processWebhook:/g)?.length, 1);
});

test("modulo nao possui rede, Prisma, persistencia ou escrita em arquivo", () => {
  const source = fs.readFileSync(path.join(backendDir, "src", "integrations", "whatsappWebhook.js"), "utf8");
  assert.doesNotMatch(source, /\b(?:fetch|axios|prisma|EventoWebhook)\b/i);
  assert.doesNotMatch(source, /require\(["'](?:node:)?(?:http|https|net|dns|fs)["']\)/i);
  assert.doesNotMatch(source, /\b(?:writeFile|appendFile|createWriteStream)\s*\(/);
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
});

function verificationQuery(token, challenge, mode = "subscribe") {
  return new URLSearchParams({
    "hub.mode": mode,
    "hub.verify_token": token,
    "hub.challenge": challenge,
  }).toString();
}

function sign(rawBody) {
  return `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}

async function rawRequest(rawBody, options = {}) {
  return request("POST", "/webhooks/whatsapp", {
    rawBody,
    contentType: options.contentType || "application/json; charset=utf-8",
    signature: options.signature,
  });
}

async function request(method, pathname, options = {}) {
  const hasRawBody = Object.hasOwn(options, "rawBody");
  const hasJsonBody = Object.hasOwn(options, "body");
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(hasRawBody || hasJsonBody ? { "content-type": options.contentType || "application/json" } : {}),
      ...(options.signature ? { "x-hub-signature-256": options.signature } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(hasRawBody ? { body: options.rawBody } : hasJsonBody ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  let body = text || null;
  if (text && response.headers.get("content-type")?.includes("application/json")) body = JSON.parse(text);
  return {
    status: response.status,
    body,
    text,
    contentType: response.headers.get("content-type") || "",
  };
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const candidate = `${file}${suffix}`;
    if (fs.existsSync(candidate)) fs.rmSync(candidate, { force: true });
  }
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} e obrigatoria para testes isolados.`);
  return value;
}
