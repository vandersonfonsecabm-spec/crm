const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const bcrypt = require("bcryptjs");

const backendDir = path.resolve(__dirname, "..");
const databaseName = `bootstrap-test-${process.pid}.db`;
const databasePath = path.join(backendDir, "prisma", databaseName);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");

process.env.DATABASE_URL = `file:./${databaseName}`;

let prisma;

before(async () => {
  fs.copyFileSync(sourceDatabase, databasePath);
  execFileSync(
    process.execPath,
    [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
    { cwd: backendDir, env: process.env, stdio: "pipe" },
  );
  const { PrismaClient } = require("@prisma/client");
  prisma = new PrismaClient();
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = `${databasePath}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
});

test("bootstrap cria Empresa e ADMIN com hash e recusa repeticao sem alterar dados", async () => {
  const { createInitialAdmin } = require("../scripts/create-admin");
  const beforeCompanies = await prisma.empresa.count();
  const beforeUsers = await prisma.usuario.count();

  await assert.rejects(
    createInitialAdmin({
      prisma,
      input: {
        companyName: "Empresa Sem Senha",
        adminName: "Admin",
        adminEmail: "admin-sem-senha@qa.example",
      },
    }),
    (error) => error.code === "BOOTSTRAP_VALIDATION_ERROR" && /senha/i.test(error.message),
  );
  assert.equal(await prisma.empresa.count(), beforeCompanies);
  assert.equal(await prisma.usuario.count(), beforeUsers);

  const input = {
    companyName: "  Empresa QA Bootstrap  ",
    companySlug: "  Empresa QA Bootstrap  ",
    adminName: "  Administrador Bootstrap  ",
    adminEmail: "  ADMIN.BOOTSTRAP@QA.EXAMPLE  ",
    adminPassword: "SenhaBootstrapSegura123",
  };
  const result = await createInitialAdmin({ prisma, input });

  assert.equal(result.resultado, "ADMIN_CREATED");
  assert.equal(result.empresa.slug, "empresa-qa-bootstrap");
  assert.equal(result.usuario.email, "admin.bootstrap@qa.example");
  assert.equal(result.usuario.papel, "ADMIN");
  assert.equal(result.usuario.senhaHash, undefined);
  assert.equal(JSON.stringify(result).includes(input.adminPassword), false);

  const empresa = await prisma.empresa.findUnique({
    where: { id: result.empresa.id },
    include: { usuarios: true },
  });
  assert.equal(empresa.ativo, true);
  assert.equal(empresa.usuarios.length, 1);
  const usuario = empresa.usuarios[0];
  assert.equal(usuario.empresaId, empresa.id);
  assert.equal(usuario.papel, "ADMIN");
  assert.equal(usuario.ativo, true);
  assert.notEqual(usuario.senhaHash, input.adminPassword);
  assert.equal(await bcrypt.compare(input.adminPassword, usuario.senhaHash), true);

  const companySnapshot = JSON.stringify({ nome: empresa.nome, slug: empresa.slug, ativo: empresa.ativo });
  const userSnapshot = JSON.stringify({
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    ativo: usuario.ativo,
    senhaHash: usuario.senhaHash,
  });
  await assert.rejects(
    createInitialAdmin({ prisma, input }),
    (error) => error.code === "BOOTSTRAP_COMPANY_EXISTS",
  );

  const companyAfterDuplicate = await prisma.empresa.findUnique({ where: { id: empresa.id } });
  const userAfterDuplicate = await prisma.usuario.findUnique({ where: { id: usuario.id } });
  assert.equal(
    JSON.stringify({ nome: companyAfterDuplicate.nome, slug: companyAfterDuplicate.slug, ativo: companyAfterDuplicate.ativo }),
    companySnapshot,
  );
  assert.equal(
    JSON.stringify({
      nome: userAfterDuplicate.nome,
      email: userAfterDuplicate.email,
      papel: userAfterDuplicate.papel,
      ativo: userAfterDuplicate.ativo,
      senhaHash: userAfterDuplicate.senhaHash,
    }),
    userSnapshot,
  );
  assert.equal(await prisma.empresa.count(), beforeCompanies + 1);
  assert.equal(await prisma.usuario.count(), beforeUsers + 1);

  await prisma.usuario.deleteMany({ where: { empresaId: empresa.id } });
  await prisma.empresa.delete({ where: { id: empresa.id } });
  assert.equal(await prisma.empresa.count(), beforeCompanies);
  assert.equal(await prisma.usuario.count(), beforeUsers);
});
