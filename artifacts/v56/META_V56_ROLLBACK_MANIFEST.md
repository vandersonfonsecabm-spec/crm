# META V56 — Rollback manifest

V56 changes are frontend-only and contain no schema/data mutation. Rollback is therefore deployment/Git-only:

1. identify the V56 frontend deployment SHA;
2. promote the prior V54/Mark A frontend deployment or create an audited Git revert;
3. push normally (never force-push);
4. verify frontend health and leave the healthy backend untouched.

No database restore is permitted or necessary for this lot. If the backend is auto-redeployed despite the zero-byte backend diff and remains healthy, do not roll it back without a backend-specific cause.
