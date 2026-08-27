"use strict";

const ROUTES = Object.freeze({
  USER_INVITE: "/aceitar-convite",
  PASSWORD_RESET: "/redefinir-senha",
});

function buildSecurityActionUrl({ kind, token, env = process.env }) {
  const route = ROUTES[String(kind || "")];
  if (!route) throw linkError("EMAIL_DELIVERY_KIND_INVALID");
  const base = validatedPublicAppUrl(env);
  const url = new URL(route, base);
  url.searchParams.set("token", String(token || ""));
  return url.toString();
}

function validatedPublicAppUrl(env = process.env) {
  const raw = String(env.SECURITY_EMAIL_PUBLIC_APP_URL || "").trim();
  if (!raw) throw linkError("SECURITY_EMAIL_PUBLIC_APP_URL_REQUIRED");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw linkError("SECURITY_EMAIL_PUBLIC_APP_URL_INVALID");
  }
  const production = String(env.NODE_ENV || "").toLowerCase() === "production";
  if (url.username || url.password || url.search || url.hash || (production && url.protocol !== "https:") || (!production && !["http:", "https:"].includes(url.protocol))) {
    throw linkError("SECURITY_EMAIL_PUBLIC_APP_URL_INVALID");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url;
}

function linkError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = { buildSecurityActionUrl, validatedPublicAppUrl };
