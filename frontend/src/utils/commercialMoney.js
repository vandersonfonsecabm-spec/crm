export const MAX_PRISMA_INT = 2_147_483_647;

export function parseNonNegativePrismaInt(value) {
  if ((typeof value !== "string" && typeof value !== "number") || typeof value === "boolean") return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = BigInt(text);
  return parsed <= BigInt(MAX_PRISMA_INT) ? Number(parsed) : null;
}

export function parseMoneyInputToCents(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const match = /^(\d+)(?:[,.](\d{0,2}))?$/.exec(text);
  if (!match) return null;
  const fraction = (match[2] || "").padEnd(2, "0");
  const cents = BigInt(match[1]) * 100n + BigInt(fraction || "0");
  return cents <= BigInt(MAX_PRISMA_INT) ? Number(cents) : null;
}

export function quantityToMilli(value) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(",", ".");
  const match = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(text);
  if (!match) return null;
  const milli = BigInt(match[1]) * 1000n + BigInt((match[2] || "").padEnd(3, "0"));
  return milli > 0n ? milli : null;
}

export function multiplyQuantityByCentsRoundHalfUp(quantity, unitCents) {
  const quantityMilli = quantityToMilli(quantity);
  const cents = parseNonNegativePrismaInt(unitCents);
  if (quantityMilli === null || cents === null) return null;
  const subtotal = (BigInt(cents) * quantityMilli + 500n) / 1000n;
  return subtotal <= BigInt(MAX_PRISMA_INT) ? Number(subtotal) : null;
}

export function addMoneyWithinPrismaInt(left, right) {
  const leftCents = parseNonNegativePrismaInt(left);
  const rightCents = parseNonNegativePrismaInt(right);
  if (leftCents === null || rightCents === null) return null;
  const total = BigInt(leftCents) + BigInt(rightCents);
  return total <= BigInt(MAX_PRISMA_INT) ? Number(total) : null;
}
