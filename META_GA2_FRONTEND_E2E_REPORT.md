# GA2 frontend and E2E report

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9
FINAL_SOURCE_SHA=eda455912c5ddecb8ae42766f56e2397dce0085c
FINAL_RUNTIME_SHA=e18121ec91ab0278c72856048fea5411db407cbb (Vercel docs-only redeploy; frontend code lineage ca9744b/eda4559)
DOCUMENT_STATUS=SOURCE_AND_BROWSER_PASS

## Maintenance 2 overlay

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
FINAL_SOURCE_SHA=43f6e51
FINAL_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
DOCUMENT_STATUS=NO_FRONTEND_DELTA_REUSED_VALID_BROWSER_EVIDENCE

This continuation changed no frontend files, routes or visual surfaces. The
previous authenticated six-viewport evidence remains valid; the new work is
backend/tooling only and was not deployed.

Frontend full suite: 194/194 PASS. TypeScript noEmit, lint and Vite build
passed; the only build advisory is the existing >500 kB bundle warning.
Focused E6A/navigation tests passed. The shell reuses the existing Inbox and
composer, product routes resolve, and AI OFF now renders an explicit state
without a run request.

The final Vercel production deployment `dpl_CL2ewq4mD1h7GTTwVu4T1fRuZeJ7` is
READY at e18121e (docs-only after eda) and returns HTTP 200. Authenticated SPA smoke passed on the
canonical CRM domain at 1920x1080, 1440x900, 1366x768, 1024x768, 900x768 and
390x844. Central, catalog, settings and Inbox remained tenant-safe, OFF and
free of horizontal overflow. Two screenshots were retained in the protected
temporary QA directory; no PII screenshots were uploaded.
