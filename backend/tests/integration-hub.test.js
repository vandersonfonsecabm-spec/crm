const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const databaseName = `hub-test-${process.pid}.db`;
const databasePath = path.join(backendDir, "prisma", databaseName);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "integration-hub-test-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.ALLOW_DEMO_MODE = "false";
process.env.INTEGRATION_ENCRYPTION_KEY = "hub-test-encryption-key-with-32-bytes-minimum";
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

test("Hub de integracoes isola empresas, criptografa credenciais e consulta dados canonicos", async () => {
  const { createIntegrationAdapter } = require("../src/integrations/adapters");
  assert.equal(createIntegrationAdapter("BLING").constructor.name, "BlingAdapter");
  assert.equal(createIntegrationAdapter("OMIE").constructor.name, "OmieAdapter");

  const adminA = await registerAndLogin("Empresa Hub A", "Admin A", "admin-a@hub.test");
  const adminB = await registerAndLogin("Empresa Hub B", "Admin B", "admin-b@hub.test");
  const gerente = await createUserAndLogin(adminA.token, "Gerente Hub", "gerente@hub.test", "GERENTE");
  const vendedor = await createUserAndLogin(adminA.token, "Vendedor Hub", "vendedor@hub.test", "VENDEDOR");

  const demo = await request("POST", "/auth/demo");
  assert.equal(demo.status, 404);

  const gerenteCreate = await request("POST", "/integracoes", {
    nome: "Bling Gerente",
    tipo: "BLING",
  }, gerente.token);
  assert.equal(gerenteCreate.status, 403);

  const vendedorCreate = await request("POST", "/integracoes", {
    nome: "Bling Vendedor",
    tipo: "BLING",
  }, vendedor.token);
  assert.equal(vendedorCreate.status, 403);

  const invalidType = await request("POST", "/integracoes", {
    nome: "ERP Invalido",
    tipo: "DESCONHECIDO",
  }, adminA.token);
  assert.equal(invalidType.status, 400);
  assert.equal(invalidType.body.codigo, "INTEGRATION_INVALID_TYPE");

  const created = await request("POST", "/integracoes", {
    nome: "Bling Hub QA",
    tipo: "BLING",
    status: "ATIVA",
    configuracao: { ambiente: "sandbox", endpoint: "nao-utilizado" },
    credenciais: { apiKey: "segredo-nao-retornar", refreshToken: "refresh-nao-retornar" },
  }, adminA.token);
  assert.equal(created.status, 201);
  assert.equal(created.body.modo, "SOMENTE_LEITURA");
  assert.equal(created.body.possuiCredenciais, true);
  assert.equal(JSON.stringify(created.body).includes("segredo-nao-retornar"), false);
  assert.equal(created.body.credenciaisCriptografadas, undefined);

  const storedIntegration = await prisma.integracao.findUnique({ where: { id: created.body.id } });
  assert.equal(storedIntegration.empresaId, adminA.empresaId);
  assert.notEqual(storedIntegration.credenciaisCriptografadas, null);
  assert.equal(storedIntegration.credenciaisCriptografadas.includes("segredo-nao-retornar"), false);
  assert.equal(storedIntegration.credenciaisCriptografadas.includes("refresh-nao-retornar"), false);

  const listA = await request("GET", "/integracoes", undefined, adminA.token);
  assert.equal(listA.status, 200);
  assert.equal(listA.body.data.length, 1);
  assert.equal(listA.body.data[0].id, created.body.id);
  assert.equal(JSON.stringify(listA.body).includes("segredo-nao-retornar"), false);

  const listB = await request("GET", "/integracoes", undefined, adminB.token);
  assert.equal(listB.status, 200);
  assert.equal(listB.body.data.length, 0);

  const crossIntegration = await request("GET", `/integracoes/${created.body.id}`, undefined, adminB.token);
  assert.equal(crossIntegration.status, 404);

  const patch = await request("PATCH", `/integracoes/${created.body.id}`, {
    nome: "Bling Hub QA Atualizado",
    ativo: false,
  }, adminA.token);
  assert.equal(patch.status, 200);
  assert.equal(patch.body.nome, "Bling Hub QA Atualizado");
  assert.equal(patch.body.ativo, false);

  const testConnection = await request("POST", `/integracoes/${created.body.id}/testar`, {}, adminA.token);
  assert.ok([400, 501].includes(testConnection.status));
  assert.ok(["BLING_CREDENTIALS_REQUIRED", "BLING_NOT_CONFIGURED"].includes(testConnection.body.codigo));
  assert.equal(testConnection.body.sincronizacao.status, "FALHOU");
  assert.equal(await prisma.sincronizacaoIntegracao.count({ where: { empresaId: adminA.empresaId, integracaoId: created.body.id } }), 1);
  assert.equal(await prisma.erroIntegracao.count({ where: { empresaId: adminA.empresaId, integracaoId: created.body.id } }), 1);

  const syncsA = await request("GET", `/integracoes/${created.body.id}/sincronizacoes`, undefined, adminA.token);
  assert.equal(syncsA.status, 200);
  assert.equal(syncsA.body.data.length, 1);
  const syncDetail = await request("GET", `/sincronizacoes/${syncsA.body.data[0].id}`, undefined, adminA.token);
  assert.equal(syncDetail.status, 200);
  const syncCross = await request("GET", `/sincronizacoes/${syncsA.body.data[0].id}`, undefined, adminB.token);
  assert.equal(syncCross.status, 404);

  const importInvalid = await request("POST", "/importacoes/metadados", {
    formato: "PDF",
    nomeArquivo: "produtos.pdf",
    tamanhoBytes: 10,
    hashArquivo: "hash",
    tipoEntidade: "PRODUTO",
  }, adminA.token);
  assert.equal(importInvalid.status, 400);
  assert.equal(importInvalid.body.codigo, "IMPORT_INVALID_FORMAT");

  const importacao = await request("POST", "/importacoes/metadados", {
    integracaoId: created.body.id,
    formato: "CSV",
    nomeArquivo: "produtos.csv",
    tamanhoBytes: 2048,
    hashArquivo: "hash-produtos-csv",
    tipoEntidade: "PRODUTO",
    totalLinhas: 2,
    linhasValidas: 2,
    linhasComErro: 0,
  }, adminA.token);
  assert.equal(importacao.status, 201);
  assert.equal(importacao.body.formato, "CSV");

  const imports = await request("GET", "/importacoes", undefined, adminA.token);
  assert.equal(imports.status, 200);
  assert.equal(imports.body.data.length, 1);
  const importDetail = await request("GET", `/importacoes/${importacao.body.id}`, undefined, adminA.token);
  assert.equal(importDetail.status, 200);

  const produto = await prisma.produtoExterno.create({
    data: {
      empresaId: adminA.empresaId,
      integracaoId: created.body.id,
      externalId: "EXT-001",
      sku: "SKU-001",
      codigoBarras: "789000000001",
      nome: "Produto Hub Teste",
      categoria: "Insumos",
      unidade: "KG",
    },
  });
  await assert.rejects(
    prisma.produtoExterno.create({
      data: {
        empresaId: adminA.empresaId,
        integracaoId: created.body.id,
        externalId: "EXT-001",
        nome: "Duplicado",
      },
    }),
    (error) => error.code === "P2002",
  );
  const estoque = await prisma.estoqueExterno.create({
    data: {
      empresaId: adminA.empresaId,
      integracaoId: created.body.id,
      produtoExternoId: produto.id,
      localNome: "Deposito",
      quantidade: "12.5",
      reservado: "2.5",
      disponivel: "10",
    },
  });
  assert.equal(estoque.quantidade.toString(), "12.5");
  await prisma.precoExterno.create({
    data: {
      empresaId: adminA.empresaId,
      integracaoId: created.body.id,
      produtoExternoId: produto.id,
      tabela: "Padrao",
      precoCentavos: 1990,
    },
  });

  await prisma.produtoExterno.create({
    data: {
      empresaId: adminB.empresaId,
      integracaoId: (await prisma.integracao.create({
        data: {
          empresaId: adminB.empresaId,
          nome: "Json Hub B",
          tipo: "JSON",
          status: "ATIVA",
        },
      })).id,
      externalId: "EXT-B",
      sku: "SKU-B",
      codigoBarras: "789000000999",
      nome: "Produto Outra Empresa",
    },
  });

  const produtosBusca = await request("GET", "/hub/produtos?busca=Produto%20Hub&page=1&limit=10", undefined, adminA.token);
  assert.equal(produtosBusca.status, 200);
  assert.equal(produtosBusca.body.data.length, 1);
  assert.equal(produtosBusca.body.data[0].produto.nome, "Produto Hub Teste");
  assert.equal(produtosBusca.body.data[0].estoques[0].quantidade, "12.5");
  assert.equal(produtosBusca.body.data[0].precos[0].precoCentavos, 1990);
  assert.equal(produtosBusca.body.pagination.total, 1);

  const produtosSku = await request("GET", "/hub/produtos?sku=SKU-001", undefined, adminA.token);
  assert.equal(produtosSku.status, 200);
  assert.equal(produtosSku.body.data.length, 1);
  const produtosCodigo = await request("GET", "/hub/produtos?codigoBarras=789000000001", undefined, adminA.token);
  assert.equal(produtosCodigo.status, 200);
  assert.equal(produtosCodigo.body.data.length, 1);
  const produtosIsolados = await request("GET", "/hub/produtos?busca=Produto", undefined, adminB.token);
  assert.equal(produtosIsolados.status, 200);
  assert.equal(produtosIsolados.body.data.some((item) => item.produto.nome === "Produto Hub Teste"), false);
});

async function registerAndLogin(empresaNome, adminNome, email) {
  const registration = await request("POST", "/auth/register-company", {
    empresaNome,
    adminNome,
    email,
    senha: "SenhaHubSegura123",
  });
  assert.equal(registration.status, 201);
  const login = await request("POST", "/auth/login", { email, senha: "SenhaHubSegura123" });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(token, nome, email, papel) {
  const created = await request("POST", "/usuarios", {
    nome,
    email,
    senha: "SenhaHubSegura123",
    papel,
  }, token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha: "SenhaHubSegura123" });
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
