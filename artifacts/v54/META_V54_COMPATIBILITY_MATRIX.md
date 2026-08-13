# V54 Compatibility Matrix

| Code / schema | Result | Reason |
|---|---|---|
| V50 code + V52 new schema | PASS_SAFE_FAIL_CLOSED only with writes paused | Old code ignores archive metadata but accepts arbitrary status writes; the compatibility window is valid only while the serving old app is read-only and lifecycle counts remain zero. |
| V54 RC code + V50 old schema | PASS_SAFE_FAIL_CLOSED during startup only | Railway `start-production` runs the canonical migration before starting the V54 server; the old deployment remains the serving code until the new container is healthy. |

Decision: `COORDINATED_MAINTENANCE` through the Railway `start-production` migration-before-server boundary, with archive lifecycle writes activated only after the V54 API/frontend deployment was healthy. No V54 request is served against the old schema. The old-code compatibility window is accepted only while lifecycle/status counts remain zero; future migration windows must explicitly pause old-app writes because V50 accepts arbitrary status strings. The rollback window closes for semantic V50 rollback after the first real archive write. Current production post-gate proves zero archive lifecycle rows/statuses after the handoff.
