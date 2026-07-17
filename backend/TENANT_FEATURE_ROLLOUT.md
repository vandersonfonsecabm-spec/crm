# Tenant feature rollout

The Leads and Site capture modules require two independent approvals:

1. the corresponding environment kill switch must be the literal value `true`;
2. the tenant must have an enabled `EmpresaFuncionalidade` record.

Missing records and database errors are fail-closed. Regular tenant administrators cannot change these records and no public activation route exists.

Future pilot activation must run as a controlled platform operation outside the public runtime. The operation must call `setTenantFeature` from `src/tenant-features/service.js` with the tenant ID, feature key, desired value, operator identity and a non-empty reason. It must first enable `LEADS_COMMUNICATION`, then `SITE_LEAD_CAPTURE` only when Site capture is part of the approved pilot. The function validates tenant ownership for an optional audit user and writes `AuditoriaFuncionalidade` in the same transaction.

Before any production activation, confirm the global flags, create and validate a SQLite backup, activate one tenant only, verify `/auth/me` capabilities, and validate that a control tenant remains disabled. Disabling the global flag remains the immediate kill switch.
