const PRODUCTION_HOST = "crm-murex-six-83.vercel.app";
const STAGING_HOST = "crm-ga3-bundle-staging.vercel.app";

export function resolveWhatsAppWebhookUrl(origin = typeof globalThis.location?.origin === "string" ? globalThis.location.origin : "") {
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return "";
  }

  const hostname = parsedOrigin.hostname.toLowerCase();
  const isProduction = hostname === PRODUCTION_HOST;
  const isStaging = hostname === STAGING_HOST || hostname.startsWith(`${STAGING_HOST.slice(0, -".vercel.app".length)}-`);
  if (!isProduction && !isStaging) return "";
  if (parsedOrigin.protocol !== "https:") return "";

  // Keep the public endpoint same-origin. Vercel's /api rewrite selects the
  // matching backend without exposing a cross-environment origin in the UI.
  return new URL("/api/webhooks/whatsapp", parsedOrigin).toString();
}

/* c8 ignore next -- the default is exercised in the browser; tests call the pure resolver. */
export const WHATSAPP_WEBHOOK_URL = resolveWhatsAppWebhookUrl();
