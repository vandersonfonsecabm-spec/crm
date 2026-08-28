export const MAX_PRISMA_INT: number;
export function parseNonNegativePrismaInt(value: unknown): number | null;
export function parseMoneyInputToCents(value: unknown): number | null;
export function quantityToMilli(value: unknown): bigint | null;
export function multiplyQuantityByCentsRoundHalfUp(quantity: unknown, unitCents: unknown): number | null;
export function addMoneyWithinPrismaInt(left: unknown, right: unknown): number | null;
