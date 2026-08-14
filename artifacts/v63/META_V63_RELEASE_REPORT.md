# V63 release report

- Runtime commit: `f57620e1e9ea91d395387ff48f12d3f3768653bb`.
- `origin/master`: same runtime SHA.
- `origin/feature/postgres-migration-prep`: same runtime SHA at functional release.
- Frontend-only release; Railway backend was reused and was not redeployed.
- Official frontend URL: `https://crm-murex-six-83.vercel.app/caixa-de-entrada`.
- Final HTML referenced the post-V63 asset bundle and the bundle contained the queue label and zero-result announcement.
- Official frontend returned HTTP 200.
- No duplicate deploy was started.

Documentation/evidence files are kept separately from the runtime SHA so a report-only commit cannot be mistaken for a new production runtime.
