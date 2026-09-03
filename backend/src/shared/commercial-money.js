"use strict";

const MAX_PRISMA_INT = 2_147_483_647;
const MAX_PRISMA_INT_BIGINT = BigInt(MAX_PRISMA_INT);

function parseNonNegativePrismaInt(value) {
  if (!["string", "number", "bigint"].includes(typeof value)) return null;
  if (value === "") return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  try {
    const parsed = BigInt(text);
    return parsed <= MAX_PRISMA_INT_BIGINT ? Number(parsed) : null;
  } catch {
    return null;
  }
}

function presentClientValue(cliente) {
  if (!cliente) return cliente;
  const hasAuthoritativeValue = cliente.valor !== undefined
    && cliente.valor !== null
    && Number.isFinite(Number(cliente.valor));
  const valorInformado = cliente.valorInformado === true && hasAuthoritativeValue;
  return {
    ...cliente,
    // Cliente.valor remains non-null in legacy storage. Never expose that
    // fallback when the persisted provenance says the value is unknown.
    valor: valorInformado ? cliente.valor : null,
    valorInformado,
  };
}

function decimalToCentsRoundHalfUp(value) {
  const parts = decimalParts(value);
  if (!parts) return null;
  const centsText = parts.fraction.padEnd(2, "0").slice(0, 2);
  let cents = BigInt(parts.whole) * 100n + BigInt(centsText || "0");
  if (parts.fraction.length > 2 && parts.fraction[2] >= "5") cents += 1n;
  return cents <= MAX_PRISMA_INT_BIGINT ? Number(cents) : null;
}

function normalizeMoneyDecimal(value) {
  const parts = decimalParts(value);
  if (!parts || decimalToCentsRoundHalfUp(value) === null) return null;
  const whole = BigInt(parts.whole).toString();
  return parts.fraction ? `${whole}.${parts.fraction}` : whole;
}

function decimalParts(value) {
  const type = typeof value;
  const decimalObject = type === "object"
    && value !== null
    && typeof value.toString === "function"
    && typeof value.toFixed === "function"
    && typeof value.isFinite === "function";
  if (!["string", "number", "bigint"].includes(type) && !decimalObject) return null;
  if (value === "") return null;
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  return match ? { whole: match[1], fraction: match[2] || "" } : null;
}

module.exports = {
  MAX_PRISMA_INT,
  decimalToCentsRoundHalfUp,
  normalizeMoneyDecimal,
  parseNonNegativePrismaInt,
  presentClientValue,
};
