const API_ORIGIN_BY_PROJECT = Object.freeze({
  // Production and staging are intentionally selected by immutable Vercel
  // project identity, never by a user-controlled URL or a shared fallback.
  prj_xAWKcwZGDQsT3pEZLUZ5YWf6lDFq: "https://api-production-875f9.up.railway.app",
  prj_AJE06pNRGunJoguCNWee0RgZV6t8: "https://ga3-bundle-api-ga3-bundle-staging.up.railway.app",
});

const API_ORIGIN_BY_PROJECT_HOST = Object.freeze({
  "crm-murex-six-83.vercel.app": "https://api-production-875f9.up.railway.app",
  "crm-ga3-bundle-staging.vercel.app": "https://ga3-bundle-api-ga3-bundle-staging.up.railway.app",
});

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function resolveApiOrigin() {
  const projectId = String(process.env.CRM_VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_ID || "").trim();
  const projectOrigin = API_ORIGIN_BY_PROJECT[projectId];
  if (projectOrigin) return projectOrigin;

  // VERCEL_PROJECT_PRODUCTION_URL is stable across preview deployments and
  // provides a safe fallback when system project IDs are not exposed.
  for (const candidate of [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]) {
    const origin = API_ORIGIN_BY_PROJECT_HOST[normalizeHost(candidate)];
    if (origin) return origin;
  }

  throw new Error("Unsupported Vercel project: refusing to generate an API rewrite");
}

const apiOrigin = resolveApiOrigin();

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
};

export default {
  installCommand: "npm install --prefix frontend",
  buildCommand: "npm run build --prefix frontend",
  outputDirectory: "frontend/dist",
  routes: [
    { src: "^/(.*)$", headers: securityHeaders, continue: true },
    { src: "^/api/(.*)$", dest: `${apiOrigin}/$1` },
    // Let Vercel serve built assets before the SPA fallback. Without this
    // phase, /assets/*.js and /assets/*.css are rewritten to index.html.
    { handle: "filesystem" },
    { src: "^/(.*)$", dest: "/index.html" },
  ],
};
