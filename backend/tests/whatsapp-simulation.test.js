const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const databaseName = `whatsapp-simulation-test-${process.pid}.db`;
const databasePath = path.join(backendDir, "prisma", databaseName);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "whatsapp-simulation-test-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.DATABASE_URL = `file:./${databaseName}`;

let api;
let prisma;
let server;
let baseUrl;

before(async () => {
  fs.copyFileSync(sourceDatabase, databasePath);
  execFileSync(process.execPath, [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: backendDir,
    env: process.env,
    stdio: "pipe",
  });

  api = require("../src/server");
  prisma = api.prisma;
  await new Promise((resolve) => {
    server = api.app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = `${databasePath}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
});

test("simulador WhatsApp processa atendimento, isola catalogo e preserva idempotencia", async () => {
  const adminA = await registerAndLogin("Empresa WhatsApp A", "Admin WhatsApp A", "admin-a@whatsapp.test");
  const adminB = await registerAndLogin("Empresa WhatsApp B", "Admin WhatsApp B", "admin-b@whatsapp.test");
  const gerente = await createUserAndLogin(adminA.token, "Gerente WhatsApp", "gerente@whatsapp.test", "GERENTE");
  const vendedor = await createUserAndLogin(adminA.token, "Vendedor WhatsApp", "vendedor@whatsapp.test", "VENDEDOR");

  await seedCatalog(adminA.empresaId, "Simulador A", [
    { externalId: "prod-disponivel", sku: "SKU-HID-20", codigoBarras: "7890000000011", nome: "Semente de Milho Hibrido 20 kg", preco: 25990, quantidade: 35, disponivel: 35, local: "Deposito Central" },
    { externalId: "prod-sem-estoque", sku: "SKU-SEM-00", codigoBarras: "7890000000012", nome: "Oleo Hidraulico Teste 20 L", preco: 12000, quantidade: 0, disponivel: 0, local: "Deposito Central" },
    { externalId: "prod-sem-preco", sku: "SKU-PRE-00", codigoBarras: "7890000000013", nome: "Rocadeira Estoque Desconhecido", preco: null, quantidade: null, disponivel: null },
    { externalId: "prod-promo", sku: "SKU-PRO-10", codigoBarras: "7890000000014", nome: "Fertilizante Promocional", preco: 30000, promocional: 25000, quantidade: 8, disponivel: 8, local: "Loja Teste" },
    { externalId: "prod-inativo", sku: "SKU-INA-10", codigoBarras: "7890000000015", nome: "Produto Inativo Teste", preco: 10000, quantidade: 10, disponivel: 10, ativo: false },
    { externalId: "prod-correia-a52", sku: "CORREIA-A52", codigoBarras: "7890000000016", nome: "Correia Agricola Reforcada A-52", categoria: "Agro Teste", preco: 74500, quantidade: 0, disponivel: 0 },
  ]);
  await seedCatalog(adminB.empresaId, "Simulador B", [
    { externalId: "prod-b", sku: "SKU-HID-20", codigoBarras: "7890000000099", nome: "Produto de Outra Empresa", preco: 99999, quantidade: 1, disponivel: 1 },
  ]);

  assert.equal((await request("POST", "/whatsapp/simular-mensagem")).status, 401);
  assert.equal((await request("POST", "/whatsapp/simular-mensagem", {}, "token-invalido")).status, 401);
  assert.equal((await request("POST", "/whatsapp/simular-mensagem", validPayload("gerente"), gerente.token)).status, 403);
  assert.equal((await request("POST", "/whatsapp/simular-mensagem", validPayload("vendedor"), vendedor.token)).status, 403);
  assert.equal((await request("POST", "/whatsapp/simular-mensagem", { ...validPayload("tenant"), empresaId: adminB.empresaId }, adminA.token)).status, 400);
  assert.equal((await request("POST", "/whatsapp/simular-mensagem", { ...validPayload("extra"), campoExtra: true }, adminA.token)).status, 400);
  assert.equal((await request("POST", "/whatsapp/simular-mensagem", { ...validPayload("phone"), telefone: "123" }, adminA.token)).status, 400);

  const first = await request("POST", "/whatsapp/simular-mensagem", {
    externalId: "msg-preco-sku",
    telefone: "+55 (11) 98888-0001",
    nome: "Cliente Simulado",
    mensagem: "Qual o preco da SKU-HID-20?",
  }, adminA.token);
  assert.equal(first.status, 201);
  assert.equal(first.body.duplicada, false);
  assert.equal(first.body.intencao.tipo, "CONSULTAR_PRECO");
  assert.equal(first.body.produtoPrincipal.nome, "Semente de Milho Hibrido 20 kg");
  assert.equal(first.body.produtosEncontrados.some((item) => item.nome === "Produto de Outra Empresa"), false);
  assert.equal(first.body.cliente.criado, true);
  assert.equal(first.body.nota.criada, true);
  assert.equal(first.body.acompanhamento.criado, false);
  assert.equal(first.body.respostaPreparada.status, "PREPARADA");

  const replay = await request("POST", "/whatsapp/simular-mensagem", {
    externalId: "msg-preco-sku",
    telefone: "+55 (11) 98888-0001",
    nome: "Cliente Simulado",
    mensagem: "Qual o preco da SKU-HID-20?",
  }, adminA.token);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.duplicada, true);
  assert.equal(await prisma.mensagemCanal.count({ where: { empresaId: adminA.empresaId, externalId: "msg-preco-sku" } }), 1);
  assert.equal(await prisma.mensagemCanal.count({ where: { empresaId: adminA.empresaId, externalId: "msg-preco-sku:prepared-response" } }), 1);
  assert.equal(await prisma.nota.count({ where: { empresaId: adminA.empresaId, texto: { contains: "msg-preco-sku" } } }), 1);

  const greeting = await request("POST", "/whatsapp/simular-mensagem", {
    externalId: "msg-saudacao",
    telefone: "+55 (11) 98888-0002",
    mensagem: "Bom dia",
  }, adminA.token);
  assert.equal(greeting.status, 201);
  assert.equal(greeting.body.intencao.tipo, "SAUDACAO");
  assert.equal(greeting.body.nota.criada, false);
  assert.equal(greeting.body.acompanhamento.criado, false);

  const human = await request("POST", "/whatsapp/simular-mensagem", {
    externalId: "msg-vendedor",
    telefone: "+55 (11) 98888-0003",
    mensagem: "Quero falar com vendedor",
  }, adminA.token);
  assert.equal(human.status, 201);
  assert.equal(human.body.acompanhamento.criado, true);
  const humanReplay = await request("POST", "/whatsapp/simular-mensagem", {
    externalId: "msg-vendedor",
    telefone: "+55 (11) 98888-0003",
    mensagem: "Quero falar com vendedor",
  }, adminA.token);
  assert.equal(humanReplay.body.duplicada, true);
  assert.equal(await prisma.acompanhamento.count({ where: { empresaId: adminA.empresaId, descricao: { contains: "msg-vendedor" } } }), 1);

  const notFound = await request("POST", "/whatsapp/simular-mensagem", {
    externalId: "msg-nao-encontrado",
    telefone: "+55 (11) 98888-0004",
    mensagem: "Tem produto inexistente alfa beta?",
  }, adminA.token);
  assert.equal(notFound.status, 201);
  assert.equal(notFound.body.produtoPrincipal, null);
  assert.equal(notFound.body.acompanhamento.criado, true);

  const weakMatch = await request("POST", "/whatsapp/simular-mensagem", {
    externalId: "msg-zeta-agro-teste-999",
    telefone: "+55 (11) 98888-0009",
    mensagem: "Tem o produto fictício Zeta Agro Teste 999?",
  }, adminA.token);
  assert.equal(weakMatch.status, 201);
  assert.equal(weakMatch.body.produtoPrincipal, null);
  assert.equal(weakMatch.body.produtosEncontrados.some((item) => item.nome === "Correia Agricola Reforcada A-52"), false);
  assert.equal(weakMatch.body.acompanhamento.criado, true);
  const weakMatchReplay = await request("POST", "/whatsapp/simular-mensagem", {
    externalId: "msg-zeta-agro-teste-999",
    telefone: "+55 (11) 98888-0009",
    mensagem: "Tem o produto fictício Zeta Agro Teste 999?",
  }, adminA.token);
  assert.equal(weakMatchReplay.body.duplicada, true);
  assert.equal(await prisma.acompanhamento.count({ where: { empresaId: adminA.empresaId, descricao: { contains: "msg-zeta-agro-teste-999" } } }), 1);

  const stockZero = await request("POST", "/whatsapp/simular-mensagem", {
    externalId: "msg-sem-estoque",
    telefone: "+55 (11) 98888-0005",
    mensagem: "Tem Oleo Hidraulico Teste em estoque?",
  }, adminA.token);
  assert.equal(stockZero.body.produtoPrincipal.disponibilidade, "SEM_ESTOQUE");

  const unknownStock = await request("POST", "/whatsapp/simular-mensagem", {
    externalId: "msg-estoque-desconhecido",
    telefone: "+55 (11) 98888-0006",
    mensagem: "Tem Rocadeira Estoque Desconhecido disponivel?",
  }, adminA.token);
  assert.equal(unknownStock.body.produtoPrincipal.disponibilidade, "DESCONHECIDO");
  assert.equal(unknownStock.body.acompanhamento.criado, true);

  const promo = await request("POST", "/whatsapp/simular-mensagem", {
    externalId: "msg-promocao",
    telefone: "+55 (11) 98888-0007",
    mensagem: "Fertilizante Promocional esta em promocao?",
  }, adminA.token);
  assert.equal(promo.body.produtoPrincipal.emPromocao, true);

  const inactive = await request("POST", "/whatsapp/simular-mensagem", {
    externalId: "msg-inativo",
    telefone: "+55 (11) 98888-0008",
    mensagem: "Tem Produto Inativo Teste?",
  }, adminA.token);
  assert.equal(inactive.body.produtoPrincipal.disponibilidade, "INDISPONIVEL");

  const existingClient = await request("POST", "/whatsapp/simular-mensagem", {
    externalId: "msg-cliente-existente",
    telefone: "+55 (11) 98888-0001",
    mensagem: "Tem Semente de Milho Hibrido?",
  }, adminA.token);
  assert.equal(existingClient.body.cliente.criado, false);
  assert.equal(await prisma.cliente.count({ where: { empresaId: adminA.empresaId, telefone: "+5511988880001" } }), 1);

  const channelA = await prisma.canalIntegracao.findFirst({ where: { empresaId: adminA.empresaId } });
  const crossChannel = await request("POST", "/whatsapp/simular-mensagem", {
    ...validPayload("cross-channel"),
    canalIntegracaoId: channelA.id,
  }, adminB.token);
  assert.equal(crossChannel.status, 404);

  const realChannel = await prisma.canalIntegracao.create({
    data: { empresaId: adminA.empresaId, tipo: "WHATSAPP_META", nome: "Canal Real Simulado", chaveInterna: "real-simulado", status: "MODO_TESTE", modoTeste: false, ativo: true },
  });
  assert.equal((await request("POST", "/whatsapp/simular-mensagem", { ...validPayload("real-channel"), canalIntegracaoId: realChannel.id }, adminA.token)).status, 400);

  assert.equal(await prisma.integracao.count({ where: { tipo: "BLING" } }), 0);
});

function validPayload(suffix) {
  return {
    externalId: `msg-${suffix}`,
    telefone: "+55 (11) 97777-0000",
    nome: "Contato Teste",
    mensagem: "Tem Semente de Milho Hibrido?",
  };
}

async function seedCatalog(empresaId, name, products) {
  const integration = await prisma.integracao.create({
    data: { empresaId, nome: name, tipo: "CSV", status: "ATIVA", modo: "SOMENTE_LEITURA" },
  });
  for (const product of products) {
    const created = await prisma.produtoExterno.create({
      data: {
        empresaId,
        integracaoId: integration.id,
        externalId: product.externalId,
        sku: product.sku,
        codigoBarras: product.codigoBarras,
        nome: product.nome,
        descricao: product.descricao,
        categoria: product.categoria,
        marca: product.marca,
        ativo: product.ativo !== false,
        sincronizadoEm: product.stale ? new Date(Date.now() - 120 * 60 * 1000) : new Date(),
      },
    });
    if (product.quantidade !== null && product.quantidade !== undefined) {
      await prisma.estoqueExterno.create({
        data: {
          empresaId,
          integracaoId: integration.id,
          produtoExternoId: created.id,
          localNome: product.local || "Deposito Teste",
          quantidade: product.quantidade,
          reservado: 0,
          disponivel: product.disponivel,
        },
      });
    }
    if (product.preco !== null && product.preco !== undefined) {
      await prisma.precoExterno.create({
        data: {
          empresaId,
          integracaoId: integration.id,
          produtoExternoId: created.id,
          tabela: "Padrao",
          precoCentavos: product.preco,
          precoPromocionalCentavos: product.promocional,
          inicioPromocao: product.promocional ? new Date(Date.now() - 60 * 60 * 1000) : null,
          fimPromocao: product.promocional ? new Date(Date.now() + 60 * 60 * 1000) : null,
        },
      });
    }
  }
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const registration = await request("POST", "/auth/register-company", {
    empresaNome,
    adminNome,
    email,
    senha: "SenhaWhatsAppSegura123",
  });
  assert.equal(registration.status, 201);
  const login = await request("POST", "/auth/login", { email, senha: "SenhaWhatsAppSegura123" });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(token, nome, email, papel) {
  const created = await request("POST", "/usuarios", {
    nome,
    email,
    senha: "SenhaWhatsAppSegura123",
    papel,
  }, token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha: "SenhaWhatsAppSegura123" });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, usuarioId: created.body.id };
}

async function request(method, pathname, body, token) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}
