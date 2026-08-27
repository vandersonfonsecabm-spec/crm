const API_ORIGIN_BY_PROJECT = Object.freeze({
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
  const projectId = String(process.env.VERCEL_PROJECT_ID || "").trim();
  const projectOrigin = API_ORIGIN_BY_PROJECT[projectId];
  if (projectOrigin) return projectOrigin;
  for (const candidate of [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]) {
    const origin = API_ORIGIN_BY_PROJECT_HOST[normalizeHost(candidate)];
    if (origin) return origin;
  }
  throw new Error("Unsupported Vercel project: refusing to generate an API rewrite");
}

const apiOrigin = resolveApiOrigin();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  },
];

export const config = {
  headers: [{ source: "/(.*)", headers: securityHeaders }],
  rewrites: [
    { source: "/api/:path*", destination: `${apiOrigin}/:path*` },
    { source: "/(.*)", destination: "/index.html" },
  ],
};
