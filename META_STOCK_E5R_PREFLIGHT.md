# E5R preflight

CURRENT_STATE_AS_OF=2026-08-23
REPORT_TIMEZONE=America/Sao_Paulo (BRT)
SOURCE_CHECKPOINT_REQUESTED=c398bbe5b3794c342fe3a630dcff65421a97e485
SOURCE_CHECKPOINT_EFFECTIVE=317d4ed0a55920649d64f0fcd903904df006babd
RELEASE_BRANCH=release/stock-mvp-e5r
STOCK_MVP_RELEASE_COMMIT=317d4ed0a55920649d64f0fcd903904df006babd
BASELINE_SHA=a5a280c3ebc54741ced02a77d4da5ec51834d583
HISTORICAL_618A_PRESERVED=PASS

The requested checkpoint exists and is an ancestor of the candidate. Later commits are the causal source-rule material-version fix (`2ed75b2`), the final source-gate documentation commit (`fff712d`), the E5R preflight reports (`9860c72`), the focused sync-failure family/version correction plus timestamp reconciliation (`78b4050`), the durable run-sequence material-version floor with retention regression proof (`4b30871`), and the INTEGER-bounded durable floor plus PostgreSQL boundary tests (`317d4ed`). No unrelated drift was found.

OFFICIAL_ENVIRONMENT_IDENTIFIED=PASS
- Railway project: glistening-playfulness (`ddfbf66c-e274-47b1-9493-286232d2f426`)
- Environment: production (`e18f76b1-e38f-468e-91fe-1eff6db9a5f8`)
- API: `api` (`16de1b91-7dcb-46b4-9231-1c3e2c3e5a92`), current deployment SHA `a5a280c3`
- Worker: `crm` (`4eef3b96-e33f-42ea-9fb8-86c17b077ab8`), current deployment SHA `a5a280c3`
- Official PostgreSQL: `Postgres-u_yI` (`e9d8a6b8-507b-45fb-92a8-3ab016f865a2`)
- Vercel project: `crm` (`prj_xAWKcwZGDQsT3pEZLUZ5YWf6lDFq`); current production deployment SHA `a5a280c3`

PRODUCTION_CURRENT_STATE_VERIFIED=PASS
- API `/health`: HTTP 200
- API `/ready`: HTTP 200
- Frontend: HTTP 200
- API/worker deployment instances: RUNNING/SUCCESS
- Stock flag keys are absent from the current API/worker variable sets; stock therefore remains default-off.

SOURCE_CHECKPOINT_VERIFIED=PASS
SOURCE_DRIFT_SAFE=PASS
PRODUCTION_DB_UNTOUCHED=PASS
