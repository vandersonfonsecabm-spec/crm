# META V56 — Release report

V56 is a frontend-only desktop shell/Inbox change. Backend code, database, schema, migrations, integrations, and business rules are unchanged.

Release candidate source: `ea1c470abc60f2f31a665e73564c840d2165fe90` (V56 runtime/docs head; verified locally after commit). No production database operation is part of this lot.

The exact READY preview for `ea1c470` was promoted to production as
`dpl_BEquhvhsfQiqhHrKDYp3D6g8iSzD`; official alias is
`https://crm-murex-six-83.vercel.app` and HTTP 200 was verified. The connected
Chrome session completed authenticated desktop smoke at 1440×900 and
1366×768. Automated axe is not exposed by the available browser surface, so
manual DOM/ARIA/keyboard/focus/overflow and console evidence is recorded
separately.

Deployment policy: Vercel/frontend may be promoted only after the final Git review and authorized release action. Railway redeploy is not required because backend bytes are unchanged.
