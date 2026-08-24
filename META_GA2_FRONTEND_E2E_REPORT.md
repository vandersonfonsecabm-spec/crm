# GA2 frontend and E2E report

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9
FINAL_SOURCE_SHA=eda455912c5ddecb8ae42766f56e2397dce0085c
FINAL_RUNTIME_SHA=eda455912c5ddecb8ae42766f56e2397dce0085c (Vercel deployment; frontend code lineage ca9744b)
DOCUMENT_STATUS=SOURCE_AND_BROWSER_PASS

Frontend full suite: 194/194 PASS. TypeScript noEmit, lint and Vite build
passed; the only build advisory is the existing >500 kB bundle warning.
Focused E6A/navigation tests passed. The shell reuses the existing Inbox and
composer, product routes resolve, and AI OFF now renders an explicit state
without a run request.

The final Vercel production deployment `dpl_B2BvtXXKqn2wbZ6RqgC1uN1jA3eF` is
READY at eda4559 and returns HTTP 200. Authenticated SPA smoke passed on the
canonical CRM domain at 1920x1080, 1440x900, 1366x768, 1024x768, 900x768 and
390x844. Central, catalog, settings and Inbox remained tenant-safe, OFF and
free of horizontal overflow. Two screenshots were retained in the protected
temporary QA directory; no PII screenshots were uploaded.
