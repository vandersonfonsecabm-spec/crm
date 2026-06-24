require("dotenv").config();

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { normalizeEmail, normalizeSlug } = require("../src/auth");

async function createInitialAdmin({ prisma, input }) {
  const data = validateInput(input);
  const existingCompany = await prisma.empresa.findUnique({
    where: { slug: data.companySlug },
    include: { usuarios: { select: { id: true, email: true } } },
  });

  if (existingCompany) {
    throw bootstrapError(
      "BOOTSTRAP_COMPANY_EXISTS",
      `A empresa '${data.companySlug}' ja existe; nenhum dado foi alterado.`,
    );
  }

  const senhaHash = await bcrypt.hash(data.adminPassword, 12);

  try {
    return await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          nome: data.companyName,
          slug: data.companySlug,
        },
      });
      const usuario = await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          nome: data.adminName,
          email: data.adminEmail,
          senhaHash,
          papel: "ADMIN",
        },
      });

      return {
        resultado: "ADMIN_CREATED",
        empresa: { id: empresa.id, nome: empresa.nome, slug: empresa.slug },
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          papel: usuario.papel,
        },
      };
    });
  } catch (error) {
    if (error && error.code === "P2002") {
      throw bootstrapError(
        "BOOTSTRAP_DUPLICATE",
        "Empresa ou administrador ja cadastrado; nenhum dado foi alterado.",
      );
    }
    throw error;
  }
}

function readInput(env = process.env) {
  return {
    companyName: env.BOOTSTRAP_COMPANY_NAME,
    companySlug: env.BOOTSTRAP_COMPANY_SLUG,
    adminName: env.BOOTSTRAP_ADMIN_NAME,
    adminEmail: env.BOOTSTRAP_ADMIN_EMAIL,
    adminPassword: env.BOOTSTRAP_ADMIN_PASSWORD,
  };
}

function validateInput(input = {}) {
  const companyName = String(input.companyName || "").trim().replace(/\s+/g, " ");
  const companySlug = normalizeSlug(input.companySlug || companyName);
  const adminName = String(input.adminName || "").trim().replace(/\s+/g, " ");
  const adminEmail = normalizeEmail(input.adminEmail);
  const adminPassword = String(input.adminPassword || "");

  if (!companyName || companyName.length > 120) {
    throw bootstrapError("BOOTSTRAP_VALIDATION_ERROR", "Nome da empresa obrigatorio, com ate 120 caracteres.");
  }
  if (!companySlug || companySlug.length > 80) {
    throw bootstrapError("BOOTSTRAP_VALIDATION_ERROR", "Slug da empresa invalido.");
  }
  if (!adminName || adminName.length > 120) {
    throw bootstrapError("BOOTSTRAP_VALIDATION_ERROR", "Nome do administrador obrigatorio, com ate 120 caracteres.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw bootstrapError("BOOTSTRAP_VALIDATION_ERROR", "E-mail do administrador invalido.");
  }
  if (adminPassword.length < 12 || adminPassword.length > 128) {
    throw bootstrapError("BOOTSTRAP_VALIDATION_ERROR", "A senha do administrador deve ter entre 12 e 128 caracteres.");
  }

  return { companyName, companySlug, adminName, adminEmail, adminPassword };
}

function bootstrapError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await createInitialAdmin({ prisma, input: readInput() });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      resultado: "ADMIN_NOT_CREATED",
      codigo: error.code || "BOOTSTRAP_ERROR",
      erro: error.message,
    }));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

module.exports = { createInitialAdmin, readInput, validateInput };
