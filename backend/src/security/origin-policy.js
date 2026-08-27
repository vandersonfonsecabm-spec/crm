"use strict";

const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://crm-murex-six-83.vercel.app",
  "https://crm-ga3-bundle-staging.vercel.app",
]);

function getAllowedOrigins(env = process.env) {
  const rawOrigins = [env.FRONTEND_URL, env.ALLOWED_ORIGINS]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((origin) => origin.trim())
    .filter(Boolean);

  const configuredOrigins = rawOrigins.map((origin) => normalizeAllowedOrigin(origin, env));
  if (configuredOrigins.some((origin) => origin === null)) {
    throw new Error("Configuracao de CORS invalida; informe origens HTTPS exatas.");
  }

  return configuredOrigins.length > 0 ? configuredOrigins : [...DEFAULT_ALLOWED_ORIGINS];
}

function normalizeAllowedOrigin(value, env = process.env) {
  try {
    const parsed = new URL(value);
    const isLocal = env.NODE_ENV !== "production"
      && parsed.protocol === "http:"
      && ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if ((!isLocal && parsed.protocol !== "https:") || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

module.exports = { DEFAULT_ALLOWED_ORIGINS, getAllowedOrigins, normalizeAllowedOrigin };
