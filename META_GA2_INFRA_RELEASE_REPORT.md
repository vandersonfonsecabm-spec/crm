# GA2 infrastructure and release report

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9
FINAL_SOURCE_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
FINAL_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6 (API/worker maintenance; frontend unchanged)
DOCUMENT_STATUS=POST_GA2_MAINTENANCE_RUNTIME_PASS_WITH_PG_LIMITATION

## Maintenance 2 overlay

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
FINAL_SOURCE_SHA=43f6e51
FINAL_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
DOCUMENT_STATUS=SOURCE_CANDIDATE_READY_NO_DEPLOY

The source candidate is `43f6e51`; production API/worker remain the
previously reconciled `0c058e5` runtime because this batch was not deployed.
The real PG command is ready and fails closed without Docker. No production
variable, flag, migration, database, restart or external Meta channel was
changed. Focused source checks and the sanitized Docker-unavailable evidence
are recorded in the final report.

Remote master advanced by the safe maintenance source fix `0c058e5` after the
GA2 runtime commits. Railway deployed API `371e473d-ea01-48d5-aa84-3f7ddc200ba4`
and worker `5292c1c6-b034-41e1-a305-1190887f5461`, both SUCCESS/RUNNING. The
previous eda deployments remain available as rollback targets. The subsequent
report-only master commit `e18121e` was skipped by Railway (`No changes to
watched files`) and produced Vercel production deployment
`dpl_CL2ewq4mD1h7GTTwVu4T1fRuZeJ7`, READY. The frontend component tree is
unchanged from ca; this is a documentation-only redeploy after the eda code
baseline.

Component parity is therefore a manifest, not one SHA string:
API=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6 (deployment 371e473d),
WORKER=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6 (deployment 5292c1c6),
VERCEL=e18121ec91ab0278c72856048fea5411db407cbb (deployment dpl_CL2ewq4mD1h7GTTwVu4T1fRuZeJ7; frontend code lineage ca/eda).
Health/ready/database remained green. Rollback targets are the previous
production component deployments and logical flags; no down migration exists.

Maintenance deploy `0c058e5` was SUCCESS/RUNNING for API and worker. Vercel was
not functionally changed because no frontend files changed. Production flags
remained AI OFF/allowlist empty. The new maintenance tag is
`saas-post-e6a-maintenance-audit-pass-2026-08-25`; the original GA2 tag was not
moved.
