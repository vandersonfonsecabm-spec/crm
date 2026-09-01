export type AICommerceErrorDetails = {
  message: string;
  code?: string;
  details: Record<string, unknown>;
};

export function parseAICommerceErrorBody(value: unknown): AICommerceErrorDetails {
  const body = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const nested = body.error && typeof body.error === "object" && !Array.isArray(body.error)
    ? body.error as Record<string, unknown>
    : null;
  const message = typeof body.error === "string"
    ? body.error
    : body.erro ?? body.message ?? nested?.message ?? "Não foi possível concluir a operação comercial.";
  const code = typeof body.codigo === "string"
    ? body.codigo
    : typeof body.code === "string"
      ? body.code
      : typeof nested?.code === "string"
        ? nested.code
        : typeof nested?.codigo === "string" ? nested.codigo : undefined;
  return { message: String(message), code, details: body };
}
