const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const fixturesDir = path.join(__dirname, "fixtures", "importacoes");
const databaseName = `hub-import-test-${process.pid}.db`;
const databasePath = path.join(backendDir, "prisma", databaseName);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "manual-import-test-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.ALLOW_DEMO_MODE = "false";
process.env.INTEGRATION_ENCRYPTION_KEY = "manual-import-test-encryption-key-32-bytes";
process.env.IMPORT_MAX_FILE_SIZE_BYTES = String(1024 * 1024);
process.env.IMPORT_MAX_ROWS = "500";
process.env.IMPORT_MAX_COLUMNS = "50";
process.env.IMPORT_MAX_ERRORS = "100";
process.env.IMPORT_BATCH_SIZE = "2";
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

test("importacao manual CSV e XLSX valida, processa, isola empresas e evita duplicidade", async () => {
  const adminA = await registerAndLogin("Empresa Import A", "Admin Import A", "admin-import-a@qa.test");
  const adminB = await registerAndLogin("Empresa Import B", "Admin Import B", "admin-import-b@qa.test");
  const gerente = await createUserAndLogin(adminA.token, "Gerente Import", "gerente-import@qa.test", "GERENTE");
  const vendedor = await createUserAndLogin(adminA.token, "Vendedor Import", "vendedor-import@qa.test", "VENDEDOR");
  const demo = await request("POST", "/auth/demo");
  assert.equal(demo.status, 404);

  const gerenteUpload = await uploadFixture("produtos-valido.csv", "text/csv", gerente.token);
  assert.equal(gerenteUpload.status, 403);
  const vendedorUpload = await uploadFixture("produtos-valido.csv", "text/csv", vendedor.token);
  assert.equal(vendedorUpload.status, 403);

  const invalidExt = await uploadFixture("arquivo-invalido.txt", "text/plain", adminA.token);
  assert.equal(invalidExt.status, 400);
  assert.equal(invalidExt.body.codigo, "IMPORT_INVALID_FORMAT");
  const invalidMime = await uploadFixture("produtos-valido.csv", "application/x-msdownload", adminA.token);
  assert.equal(invalidMime.status, 400);
  assert.equal(invalidMime.body.codigo, "IMPORT_INVALID_FORMAT");
  const empty = await uploadFixture("arquivo-vazio.csv", "text/csv", adminA.token);
  assert.equal(empty.status, 400);
  assert.equal(empty.body.codigo, "IMPORT_EMPTY_FILE");
  const tooLarge = await uploadBuffer("grande.csv", Buffer.alloc(1024 * 1024 + 100, "a"), "text/csv", adminA.token);
  assert.equal(tooLarge.status, 400);

  const upload = await uploadFixture("produtos-valido.csv", "text/csv", adminA.token);
  assert.equal(upload.status, 201);
  assert.equal(upload.body.formato, "CSV");
  assert.deepEqual(upload.body.colunasDetectadas.slice(0, 3), ["id", "sku", "nome"]);
  assert.equal(upload.body.sugestaoMapeamento.externalId, "id");
  assert.equal(upload.body.sugestaoMapeamento.nome, "nome");
  assert.equal(upload.body.totalLinhasEstimado, 2);
  assert.equal(upload.body.primeirasLinhas.length, 2);

  const importId = upload.body.importacao.id;
  const invalidMap = await request("POST", `/importacoes/${importId}/mapear`, {
    mapeamento: { externalId: "id", sku: "sku" },
  }, adminA.token);
  assert.equal(invalidMap.status, 400);
  assert.equal(invalidMap.body.codigo, "IMPORT_MAPPING_INVALID");

  const mapped = await request("POST", `/importacoes/${importId}/mapear`, mappingPayload({ precoMode: "REAIS_VIRGULA" }), adminA.token);
  assert.equal(mapped.status, 200);
  assert.equal(mapped.body.previa.length, 2);
  assert.equal(mapped.body.linhasValidasEstimadas, 2);

  const validated = await request("POST", `/importacoes/${importId}/validar`, {}, adminA.token);
  assert.equal(validated.status, 200);
  assert.equal(validated.body.resumo.linhasValidas, 2);
  assert.equal(validated.body.resumo.linhasComErro, 0);

  const processed = await request("POST", `/importacoes/${importId}/processar`, {
    importarLinhasValidas: true,
    estrategiaAtualizacao: "CRIAR_E_ATUALIZAR",
  }, adminA.token);
  assert.equal(processed.status, 200);
  assert.equal(processed.body.importacao.status, "CONCLUIDO");
  assert.equal(processed.body.resultado.criados, 2);
  assert.equal(processed.body.resultado.estoques, 2);
  assert.equal(processed.body.resultado.precos, 2);

  assert.equal(await prisma.produtoExterno.count({ where: { empresaId: adminA.empresaId } }), 2);
  assert.equal(await prisma.estoqueExterno.count({ where: { empresaId: adminA.empresaId } }), 2);
  assert.equal(await prisma.precoExterno.count({ where: { empresaId: adminA.empresaId } }), 2);

  const produtos = await request("GET", "/hub/produtos?busca=Fertilizante&apenasComEstoque=true&precoMinimo=1000&precoMaximo=2000", undefined, adminA.token);
  assert.equal(produtos.status, 200);
  assert.equal(produtos.body.data.length, 1);
  assert.equal(produtos.body.data[0].produto.externalId, "EXT-001");
  assert.equal(produtos.body.data[0].estoques[0].quantidade, "25.5");
  assert.equal(produtos.body.data[0].precos[0].precoCentavos, 1250);
  assert.equal(produtos.body.data[0].origem.tipo, "CSV");

  const isolated = await request("GET", "/hub/produtos?busca=Fertilizante", undefined, adminB.token);
  assert.equal(isolated.status, 200);
  assert.equal(isolated.body.data.length, 0);

  const duplicateUpload = await uploadFixture("produtos-valido.csv", "text/csv", adminA.token);
  assert.equal(duplicateUpload.status, 409);
  assert.equal(duplicateUpload.body.codigo, "IMPORT_DUPLICATE_FILE");

  const reupload = await uploadFixture("produtos-valido.csv", "text/csv", adminA.token, { confirmarReprocessamento: "true" });
  assert.equal(reupload.status, 201);
  const reimportId = reupload.body.importacao.id;
  await request("POST", `/importacoes/${reimportId}/mapear`, mappingPayload({ precoMode: "REAIS_VIRGULA" }), adminA.token);
  await request("POST", `/importacoes/${reimportId}/validar`, {}, adminA.token);
  const reprocessed = await request("POST", `/importacoes/${reimportId}/processar`, {
    importarLinhasValidas: true,
    estrategiaAtualizacao: "CRIAR_E_ATUALIZAR",
  }, adminA.token);
  assert.equal(reprocessed.status, 200);
  assert.equal(reprocessed.body.resultado.criados, 0);
  assert.equal(reprocessed.body.resultado.atualizados, 2);
  assert.equal(await prisma.produtoExterno.count({ where: { empresaId: adminA.empresaId, externalId: { in: ["EXT-001", "EXT-002"] } } }), 2);

  const partialUpload = await uploadFixture("produtos-parcial-invalido.csv", "text/csv", adminA.token);
  assert.equal(partialUpload.status, 201);
  const partialId = partialUpload.body.importacao.id;
  await request("POST", `/importacoes/${partialId}/mapear`, mappingPayload({ precoMode: "REAIS_VIRGULA" }), adminA.token);
  const partialValidated = await request("POST", `/importacoes/${partialId}/validar`, {}, adminA.token);
  assert.equal(partialValidated.status, 200);
  assert.equal(partialValidated.body.resumo.linhasValidas, 1);
  assert.equal(partialValidated.body.resumo.linhasComErro, 3);
  const errors = await request("GET", `/importacoes/${partialId}/erros?codigo=INVALID_PRICE`, undefined, adminA.token);
  assert.equal(errors.status, 200);
  assert.equal(errors.body.pagination.total, 1);
  const partialProcessed = await request("POST", `/importacoes/${partialId}/processar`, {
    importarLinhasValidas: true,
    estrategiaAtualizacao: "CRIAR_E_ATUALIZAR",
  }, adminA.token);
  assert.equal(partialProcessed.status, 200);
  assert.equal(partialProcessed.body.importacao.status, "CONCLUIDO_COM_ERROS");

  const semicolonUpload = await uploadFixture("produtos-ponto-virgula.csv", "text/csv", adminA.token);
  assert.equal(semicolonUpload.status, 201);
  assert.equal(semicolonUpload.body.separador, ";");
  assert.equal(semicolonUpload.body.sugestaoMapeamento.externalId, "codigo");

  const xlsxUpload = await uploadFixture("produtos-valido.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", adminA.token);
  assert.equal(xlsxUpload.status, 201);
  assert.equal(xlsxUpload.body.formato, "XLSX");
  assert.equal(xlsxUpload.body.planilha, "Produtos");
  const xlsxId = xlsxUpload.body.importacao.id;
  await request("POST", `/importacoes/${xlsxId}/mapear`, mappingPayload({ precoMode: "CENTAVOS" }), adminA.token);
  await request("POST", `/importacoes/${xlsxId}/validar`, {}, adminA.token);
  const xlsxProcessed = await request("POST", `/importacoes/${xlsxId}/processar`, {
    importarLinhasValidas: true,
    estrategiaAtualizacao: "CRIAR_E_ATUALIZAR",
  }, adminA.token);
  assert.equal(xlsxProcessed.status, 200);
  assert.equal(xlsxProcessed.body.resultado.criados, 1);

  const cancelUpload = await uploadFixture("produtos-ponto-virgula.csv", "text/csv", adminB.token);
  assert.equal(cancelUpload.status, 201);
  const canceled = await request("POST", `/importacoes/${cancelUpload.body.importacao.id}/cancelar`, {}, adminB.token);
  assert.equal(canceled.status, 200);
  assert.equal(canceled.body.status, "CANCELADO");
  const processCanceled = await request("POST", `/importacoes/${cancelUpload.body.importacao.id}/processar`, {
    importarLinhasValidas: true,
    estrategiaAtualizacao: "CRIAR_E_ATUALIZAR",
  }, adminB.token);
  assert.equal(processCanceled.status, 409);

  const imports = await request("GET", "/importacoes?limit=5", undefined, adminA.token);
  assert.equal(imports.status, 200);
  assert.ok(imports.body.pagination.total >= 5);
  const detail = await request("GET", `/importacoes/${partialId}`, undefined, adminA.token);
  assert.equal(detail.status, 200);
  assert.ok(detail.body.hashArquivo.includes("..."));

  const uploadDir = path.join(os.tmpdir(), "crm-agro-import-uploads");
  const leftovers = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir).filter((name) => name.startsWith("import-")) : [];
  assert.deepEqual(leftovers, []);
});

function mappingPayload({ precoMode }) {
  return {
    mapeamento: {
      externalId: "id",
      sku: "sku",
      nome: "nome",
      categoria: "categoria",
      marca: "marca",
      unidade: "unidade",
      quantidade: "estoque",
      reservado: "reservado",
      precoCentavos: "preco",
    },
    opcoes: {
      monetario: {
        precoCentavos: precoMode,
      },
    },
  };
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const registration = await request("POST", "/auth/register-company", {
    empresaNome,
    adminNome,
    email,
    senha: "SenhaImportSegura123",
  });
  assert.equal(registration.status, 201);
  const login = await request("POST", "/auth/login", { email, senha: "SenhaImportSegura123" });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(token, nome, email, papel) {
  const created = await request("POST", "/usuarios", {
    nome,
    email,
    senha: "SenhaImportSegura123",
    papel,
  }, token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha: "SenhaImportSegura123" });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, usuarioId: created.body.id };
}

async function uploadFixture(filename, mime, token, fields = {}) {
  const filePath = path.join(fixturesDir, filename);
  return uploadBuffer(filename, fs.readFileSync(filePath), mime, token, fields);
}

async function uploadBuffer(filename, buffer, mime, token, fields = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("arquivo", new Blob([buffer], { type: mime }), filename);
  const response = await fetch(`${baseUrl}/importacoes/upload`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
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
