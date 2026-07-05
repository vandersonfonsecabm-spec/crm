const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const databaseName = `hub-commercial-test-${process.pid}.db`;
const databasePath = path.join(backendDir, "prisma", databaseName);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "commercial-test-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "commercial-test-encryption-key-32-bytes";
process.env.IMPORT_MAX_FILE_SIZE_BYTES = String(2 * 1024 * 1024);
process.env.IMPORT_MAX_ROWS = "1000";
process.env.IMPORT_MAX_COLUMNS = "80";
process.env.IMPORT_MAX_ERRORS = "200";
process.env.IMPORT_BATCH_SIZE = "25";
process.env.HUB_DATA_STALE_AFTER_MINUTES = "60";
process.env.DATABASE_URL = `file:./${databaseName}`;

let api;
let prisma;
let server;
let baseUrl;
let operationalFile;
let locationUpdateFile;
let updateFile;

before(async () => {
  fs.copyFileSync(sourceDatabase, databasePath);
  execFileSync(process.execPath, [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: backendDir,
    env: process.env,
    stdio: "pipe",
  });

  operationalFile = path.join(os.tmpdir(), `crm-operacional-${process.pid}.csv`);
  locationUpdateFile = path.join(os.tmpdir(), `crm-operacional-locais-${process.pid}.csv`);
  updateFile = path.join(os.tmpdir(), `crm-operacional-update-${process.pid}.csv`);
  fs.writeFileSync(operationalFile, buildOperationalCsv(), "utf8");
  fs.writeFileSync(locationUpdateFile, buildSecondLocationCsv(), "utf8");
  fs.writeFileSync(updateFile, buildUpdateCsv(), "utf8");

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
  for (const file of [operationalFile, locationUpdateFile, updateFile]) {
    if (file && fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = `${databasePath}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
});

test("consulta comercial unificada usa dados importados e reporta qualidade", async () => {
  const adminA = await registerAndLogin("Empresa Comercial A", "Admin Comercial A", "admin-comercial-a@qa.test");
  const adminB = await registerAndLogin("Empresa Comercial B", "Admin Comercial B", "admin-comercial-b@qa.test");
  const gerente = await createUserAndLogin(adminA.token, "Gerente Comercial", "gerente-comercial@qa.test", "GERENTE");
  const demo = await request("POST", "/auth/demo");

  const demoConsulta = await request("GET", "/hub/consulta-comercial?q=Produto", undefined, demo.body.access_token);
  assert.equal(demoConsulta.status, 403);
  const gerenteConsulta = await request("GET", "/hub/consulta-comercial?q=Produto", undefined, gerente.token);
  assert.equal(gerenteConsulta.status, 403);

  const upload = await uploadFile(operationalFile, "catalogo-operacional.csv", "text/csv", adminA.token);
  assert.equal(upload.status, 201);
  assert.equal(upload.body.totalLinhasEstimado, 103);
  assert.ok(upload.body.colunasDetectadas.includes("codigo_barras"));
  assert.equal(upload.body.sugestaoMapeamento.codigoBarras, "codigo_barras");

  const importId = upload.body.importacao.id;
  const mapped = await request("POST", `/importacoes/${importId}/mapear`, commercialMapping(), adminA.token);
  assert.equal(mapped.status, 200);
  assert.equal(mapped.body.linhasValidasEstimadas, 100);
  assert.equal(mapped.body.linhasInvalidasEstimadas, 3);

  const validated = await request("POST", `/importacoes/${importId}/validar`, {}, adminA.token);
  assert.equal(validated.status, 200);
  assert.equal(validated.body.resumo.totalLinhas, 103);
  assert.equal(validated.body.resumo.linhasValidas, 100);
  assert.equal(validated.body.resumo.linhasComErro, 3);

  const errors = await request("GET", `/importacoes/${importId}/erros?limit=10`, undefined, adminA.token);
  assert.equal(errors.status, 200);
  assert.equal(errors.body.pagination.total, 3);
  assert.ok(errors.body.data.some((erro) => erro.codigo === "MISSING_NAME"));
  assert.ok(errors.body.data.some((erro) => erro.codigo === "INVALID_PRICE"));
  assert.ok(errors.body.data.some((erro) => erro.codigo === "DUPLICATE_IN_FILE"));

  const processed = await request("POST", `/importacoes/${importId}/processar`, {
    importarLinhasValidas: true,
    estrategiaAtualizacao: "CRIAR_E_ATUALIZAR",
  }, adminA.token);
  assert.equal(processed.status, 200);
  assert.equal(processed.body.importacao.status, "CONCLUIDO_COM_ERROS");
  assert.equal(processed.body.resultado.criados, 100);
  assert.equal(processed.body.resultado.estoquesCriados, 99);
  assert.equal(processed.body.resultado.precosCriados, 99);

  const duplicateUpload = await uploadFile(operationalFile, "catalogo-operacional.csv", "text/csv", adminA.token);
  assert.equal(duplicateUpload.status, 409);
  assert.equal(duplicateUpload.body.codigo, "IMPORT_DUPLICATE_FILE");
  assert.equal(await prisma.produtoExterno.count({ where: { empresaId: adminA.empresaId } }), 100);

  const secondLocation = await fullImport(locationUpdateFile, "catalogo-operacional-locais.csv", adminA.token, "CENTAVOS");
  assert.equal(secondLocation.processed.body.resultado.criados, 0);
  assert.equal(secondLocation.processed.body.resultado.atualizados, 1);
  assert.equal(secondLocation.processed.body.resultado.estoquesCriados, 1);

  const updateImport = await fullImport(updateFile, "catalogo-operacional-update.csv", adminA.token, "CENTAVOS");
  assert.equal(updateImport.processed.body.resultado.criados, 0);
  assert.equal(updateImport.processed.body.resultado.atualizados, 1);
  assert.equal(updateImport.processed.body.resultado.estoquesAtualizados, 1);
  assert.equal(updateImport.processed.body.resultado.precosAtualizados, 1);

  const produtoStale = await prisma.produtoExterno.findFirst({ where: { empresaId: adminA.empresaId, sku: "SKU-OPER-001" } });
  const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await prisma.produtoExterno.update({ where: { id: produtoStale.id }, data: { sincronizadoEm: oldDate } });

  const skuSearch = await request("GET", "/hub/consulta-comercial?sku=SKU-OPER-001", undefined, adminA.token);
  assert.equal(skuSearch.status, 200);
  assert.equal(skuSearch.body.data.length, 1);
  const skuProduct = skuSearch.body.data[0];
  assert.equal(skuProduct.nome, "Produto Operacional 001 Atualizado");
  assert.equal(skuProduct.disponibilidade, "EM_ESTOQUE");
  assert.equal(skuProduct.quantidadeTotal, "57");
  assert.equal(skuProduct.quantidadeReservadaTotal, "7");
  assert.equal(skuProduct.quantidadeDisponivelTotal, "50");
  assert.equal(skuProduct.precoAtualCentavos, 7900);
  assert.equal(skuProduct.precoOriginalCentavos, 9900);
  assert.equal(skuProduct.emPromocao, true);
  assert.equal(skuProduct.dadosDesatualizados, true);
  assert.ok(skuProduct.avisos.includes("Os dados podem estar desatualizados."));
  assert.equal(skuProduct.estoques.length, 2);

  const barcodeSearch = await request("GET", "/hub/consulta-comercial?codigoBarras=789000000002", undefined, adminA.token);
  assert.equal(barcodeSearch.body.data[0].sku, "SKU-OPER-002");
  assert.equal(barcodeSearch.body.data[0].disponibilidade, "SEM_ESTOQUE");

  const noStockSearch = await request("GET", "/hub/consulta-comercial?sku=SKU-OPER-003", undefined, adminA.token);
  assert.equal(noStockSearch.body.data[0].disponibilidade, "DESCONHECIDO");
  assert.ok(noStockSearch.body.data[0].avisos.includes("Produto sem informação de estoque."));

  const inactiveSearch = await request("GET", "/hub/consulta-comercial?sku=SKU-OPER-004", undefined, adminA.token);
  assert.equal(inactiveSearch.body.data[0].disponibilidade, "INDISPONIVEL");

  const futurePromo = await request("GET", "/hub/consulta-comercial?sku=SKU-OPER-005", undefined, adminA.token);
  assert.equal(futurePromo.body.data[0].emPromocao, false);
  assert.equal(futurePromo.body.data[0].precoAtualCentavos, futurePromo.body.data[0].precoOriginalCentavos);

  const expiredPromo = await request("GET", "/hub/consulta-comercial?sku=SKU-OPER-006", undefined, adminA.token);
  assert.equal(expiredPromo.body.data[0].emPromocao, false);

  const noPrice = await request("GET", "/hub/consulta-comercial?sku=SKU-OPER-007", undefined, adminA.token);
  assert.equal(noPrice.body.data[0].precoAtualCentavos, null);
  assert.ok(noPrice.body.data[0].avisos.includes("Produto sem informação de preço."));

  const nameSearch = await request("GET", "/hub/consulta-comercial?q=Operacional%20010", undefined, adminA.token);
  assert.equal(nameSearch.body.data.length, 1);
  const brandSearch = await request("GET", "/hub/consulta-comercial?marca=Marca%20Beta&limite=5", undefined, adminA.token);
  assert.equal(brandSearch.status, 200);
  assert.ok(brandSearch.body.data.length > 0);
  const categorySearch = await request("GET", "/hub/consulta-comercial?categoria=Categoria%20Solo&limite=5", undefined, adminA.token);
  assert.equal(categorySearch.status, 200);
  assert.ok(categorySearch.body.data.every((item) => item.categoria === "Categoria Solo"));
  const localSearch = await request("GET", "/hub/consulta-comercial?local=Loja%20B", undefined, adminA.token);
  assert.equal(localSearch.body.data.length, 1);
  assert.equal(localSearch.body.data[0].sku, "SKU-OPER-001");
  const onlyAvailable = await request("GET", "/hub/consulta-comercial?somenteDisponiveis=true&limite=100", undefined, adminA.token);
  assert.equal(onlyAvailable.status, 200);
  assert.ok(onlyAvailable.body.data.every((item) => item.disponibilidade === "EM_ESTOQUE"));
  const paginated = await request("GET", "/hub/consulta-comercial?pagina=2&limite=10", undefined, adminA.token);
  assert.equal(paginated.body.pagination.page, 2);
  assert.equal(paginated.body.pagination.limit, 10);
  const maxLimit = await request("GET", "/hub/consulta-comercial?limite=500", undefined, adminA.token);
  assert.equal(maxLimit.body.pagination.limit, 100);

  const quality = await request("GET", "/hub/qualidade-dados", undefined, adminA.token);
  assert.equal(quality.status, 200);
  assert.equal(quality.body.totalProdutos, 100);
  assert.equal(quality.body.produtosAtivos, 99);
  assert.equal(quality.body.produtosInativos, 1);
  assert.equal(quality.body.produtosSemEstoque, 1);
  assert.equal(quality.body.produtosSemPreco, 1);
  assert.equal(quality.body.produtosComDadosDesatualizados, 1);
  assert.equal(quality.body.ultimaImportacao.status, "CONCLUIDO");
  assert.ok(Array.isArray(quality.body.integracoesOrigem));

  const qualityDemo = await request("GET", "/hub/qualidade-dados", undefined, demo.body.access_token);
  assert.equal(qualityDemo.status, 403);

  const isolated = await request("GET", "/hub/consulta-comercial?q=Operacional", undefined, adminB.token);
  assert.equal(isolated.status, 200);
  assert.equal(isolated.body.pagination.total, 0);
});

function buildOperationalCsv() {
  const rows = [[
    "id", "sku", "codigo_barras", "nome", "descricao", "categoria", "marca", "unidade", "ativo", "estoque", "reservado", "local_id", "local", "preco", "preco_promocional", "inicio_promocao", "fim_promocao",
  ]];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const pastStart = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const pastEnd = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const futureStart = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const futureEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

  for (let i = 1; i <= 100; i += 1) {
    const id = String(i).padStart(3, "0");
    const category = i % 3 === 0 ? "Categoria Solo" : i % 3 === 1 ? "Categoria Sementes" : "Categoria Defensivos";
    const brand = i % 2 === 0 ? "Marca Beta" : "Marca Alfa";
    const unit = i % 4 === 0 ? "UN" : i % 4 === 1 ? "KG" : i % 4 === 2 ? "SC" : "L";
    let ativo = "true";
    let estoque = String(10 + i);
    let reservado = String(i % 5);
    let preco = String(9000 + i);
    let promo = "";
    let inicio = "";
    let fim = "";

    if (i === 1) {
      estoque = "50";
      reservado = "5";
      preco = "10000";
      promo = "8500";
      inicio = yesterday;
      fim = tomorrow;
    }
    if (i === 2) {
      estoque = "0";
      reservado = "0";
    }
    if (i === 3) {
      estoque = "";
      reservado = "";
    }
    if (i === 4) ativo = "false";
    if (i === 5) {
      promo = "7000";
      inicio = futureStart;
      fim = futureEnd;
    }
    if (i === 6) {
      promo = "7100";
      inicio = pastStart;
      fim = pastEnd;
    }
    if (i === 7) preco = "";

    rows.push([
      `EXT-OPER-${id}`,
      `SKU-OPER-${id}`,
      `789000000${id}`,
      `Produto Operacional ${id}`,
      `Descricao operacional ${id}`,
      category,
      brand,
      unit,
      ativo,
      estoque,
      reservado,
      "LOC-A",
      "Loja A",
      preco,
      promo,
      inicio,
      fim,
    ]);
  }

  rows.push(["EXT-OPER-101", "SKU-OPER-101", "789000000101", "", "Sem nome", "Categoria Solo", "Marca Alfa", "KG", "true", "1", "0", "LOC-A", "Loja A", "1200", "", "", ""]);
  rows.push(["EXT-OPER-102", "SKU-OPER-102", "789000000102", "Preco invalido", "Preco ruim", "Categoria Solo", "Marca Alfa", "KG", "true", "1", "0", "LOC-A", "Loja A", "abc", "", "", ""]);
  rows.push(["EXT-OPER-001", "SKU-OPER-DUP", "789000000999", "Duplicado", "Duplicado", "Categoria Solo", "Marca Alfa", "KG", "true", "1", "0", "LOC-A", "Loja A", "1200", "", "", ""]);

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function buildSecondLocationCsv() {
  return [
    ["id", "sku", "codigo_barras", "nome", "descricao", "categoria", "marca", "unidade", "ativo", "estoque", "reservado", "local_id", "local", "preco"],
    ["EXT-OPER-001", "SKU-OPER-001", "789000000001", "Produto Operacional 001", "Descricao operacional 001", "Categoria Sementes", "Marca Alfa", "KG", "true", "5", "1", "LOC-B", "Loja B", "10000"],
  ].map((row) => row.map(csvCell).join(",")).join("\n");
}

function buildUpdateCsv() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return [
    ["id", "sku", "codigo_barras", "nome", "descricao", "categoria", "marca", "unidade", "ativo", "estoque", "reservado", "local_id", "local", "preco", "preco_promocional", "inicio_promocao", "fim_promocao"],
    ["EXT-OPER-001", "SKU-OPER-001", "789000000001", "Produto Operacional 001 Atualizado", "Descricao atualizada", "Categoria Sementes", "Marca Alfa", "KG", "true", "52", "6", "LOC-A", "Loja A", "9900", "7900", yesterday, tomorrow],
  ].map((row) => row.map(csvCell).join(",")).join("\n");
}

function commercialMapping() {
  return {
    mapeamento: {
      externalId: "id",
      sku: "sku",
      codigoBarras: "codigo_barras",
      nome: "nome",
      descricao: "descricao",
      categoria: "categoria",
      marca: "marca",
      unidade: "unidade",
      ativo: "ativo",
      quantidade: "estoque",
      reservado: "reservado",
      localExternalId: "local_id",
      localNome: "local",
      precoCentavos: "preco",
      precoPromocionalCentavos: "preco_promocional",
      inicioPromocao: "inicio_promocao",
      fimPromocao: "fim_promocao",
    },
    opcoes: { monetario: { precoCentavos: "CENTAVOS", precoPromocionalCentavos: "CENTAVOS" } },
  };
}

async function fullImport(filePath, filename, token, precoMode) {
  const upload = await uploadFile(filePath, filename, "text/csv", token, { confirmarReprocessamento: "true" });
  assert.equal(upload.status, 201);
  const importId = upload.body.importacao.id;
  const payload = commercialMapping();
  payload.opcoes.monetario.precoCentavos = precoMode;
  payload.opcoes.monetario.precoPromocionalCentavos = precoMode;
  const mapped = await request("POST", `/importacoes/${importId}/mapear`, payload, token);
  assert.equal(mapped.status, 200);
  const validated = await request("POST", `/importacoes/${importId}/validar`, {}, token);
  assert.equal(validated.status, 200);
  const processed = await request("POST", `/importacoes/${importId}/processar`, { importarLinhasValidas: true, estrategiaAtualizacao: "CRIAR_E_ATUALIZAR" }, token);
  assert.equal(processed.status, 200);
  return { upload, mapped, validated, processed };
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function registerAndLogin(empresaNome, adminNome, email) {
  const registration = await request("POST", "/auth/register-company", {
    empresaNome,
    adminNome,
    email,
    senha: "SenhaComercialSegura123",
  });
  assert.equal(registration.status, 201);
  const login = await request("POST", "/auth/login", { email, senha: "SenhaComercialSegura123" });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, empresaId: registration.body.empresa.id, usuarioId: registration.body.usuario.id };
}

async function createUserAndLogin(token, nome, email, papel) {
  const created = await request("POST", "/usuarios", {
    nome,
    email,
    senha: "SenhaComercialSegura123",
    papel,
  }, token);
  assert.equal(created.status, 201);
  const login = await request("POST", "/auth/login", { email, senha: "SenhaComercialSegura123" });
  assert.equal(login.status, 200);
  return { token: login.body.access_token, usuarioId: created.body.id };
}

async function uploadFile(filePath, filename, mime, token, fields = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("arquivo", new Blob([fs.readFileSync(filePath)], { type: mime }), filename);
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
  return { status: response.status, body: text ? JSON.parse(text) : null };
}


