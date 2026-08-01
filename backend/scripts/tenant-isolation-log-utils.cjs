const SAFE_CODE = /^(?:P\d{4}|[A-Z][A-Z0-9_]{2,79})$/;

function safeContext(value) {
  const normalized = String(value || "verifier")
    .replace(/[^A-Za-z0-9_.-]/g, "_")
    .slice(0, 64);
  return normalized || "verifier";
}

function prismaCategory(text) {
  if (/timeout|timed out|ETIMEDOUT|P2024/i.test(text)) return "TIMEOUT";
  if (/environment variable|schema validation|P1012/i.test(text)) return "CONFIGURATION";
  if (/ECONNREFUSED|ECONNRESET|P1001|P1002|connect/i.test(text)) return "CONNECTION";
  if (/migration|migrate/i.test(text)) return "MIGRATION";
  if (/P\d{4}|SQL|database|constraint|foreign key/i.test(text)) return "DATABASE";
  return "PRISMA";
}

function prismaMessage(category) {
  if (category === "TIMEOUT") return "A operacao excedeu o tempo limite.";
  if (category === "CONFIGURATION") return "A configuracao do Prisma falhou na validacao.";
  if (category === "CONNECTION") return "A conexao com o banco falhou.";
  if (category === "MIGRATION") return "A operacao de migration falhou.";
  if (category === "DATABASE") return "O banco rejeitou a operacao do Prisma.";
  return "A operacao do Prisma falhou.";
}

function sanitizePrismaOutput(output, context = "verifier") {
  const text = String(output || "");
  const category = prismaCategory(text);
  const code = text.match(/\bP\d{4}\b/)?.[0] || null;
  return {
    category,
    code,
    context: safeContext(context),
    message: prismaMessage(category),
  };
}

function createPrismaFailure(context, output) {
  const details = sanitizePrismaOutput(output, context);
  const error = new Error(details.message);
  error.name = "PrismaOperationFailure";
  error.code = "PRISMA_OPERATION_FAILED";
  error.safeDetails = {
    ...details,
    code: details.code || error.code,
  };
  return error;
}

function sanitizeFailure(error, context = "verifier") {
  if (error?.safeDetails) return error.safeDetails;
  const code = String(error?.code || "");
  if (SAFE_CODE.test(code) && code.startsWith("TENANT_")) {
    return {
      category: "TENANT_GATE",
      code,
      context: safeContext(context),
      message: "A verificacao de isolamento falhou.",
    };
  }
  if (!/prisma|migration|database|P\d{4}|SQL|connect|timeout/i.test(String(error?.message || ""))) {
    return {
      category: "RUNTIME",
      code: SAFE_CODE.test(code) ? code : "VERIFIER_FAILED",
      context: safeContext(context),
      message: "A execucao falhou.",
    };
  }
  return sanitizePrismaOutput(error?.message, context);
}

module.exports = {
  createPrismaFailure,
  sanitizeFailure,
  sanitizePrismaOutput,
};
