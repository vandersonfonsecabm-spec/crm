# META V56 — Production smoke

Authenticated production desktop smoke completed in the connected Chrome
session after the exact V56 deployment was promoted. No provider call,
outbound message, credential entry or business-data mutation was performed.

The canonical public frontend `https://crm-murex-six-83.vercel.app` returned
HTTP 200 and the authenticated tab rendered the V56 shell. Production
deployment `dpl_BEquhvhsfQiqhHrKDYp3D6g8iSzD` is READY/production and carries
runtime SHA `ea1c470abc60f2f31a665e73564c840d2165fe90`. Railway health returned
HTTP 200 at `/health` and backend bytes were unchanged.

Desktop smoke results:

- 1440×900 and 1366×768 loaded the Inbox with a selected test conversation
  and Contexto.
- Sidebar click, Space and Enter toggled 224px ↔ 68px; reload and route change
  preserved the collapsed preference.
- Inbox 24/52/24 geometry kept Chat largest and the composer anchored to the
  bottom; list, history and Contexto used independent scroll containers.
- `document.documentElement.scrollWidth - clientWidth` was 0 at both viewports.
- Visão Geral, Clientes and Integrações retained zero horizontal overflow.
- 390×844 sentinel opened with the mobile navigation visible and desktop rail
  hidden; no blank screen or horizontal overflow.
- Production console error/warning capture was empty.

The safe pre-deploy evidence is:

- frontend build PASS;
- 159/159 frontend tests PASS;
- focused V56 contracts PASS;
- zero backend/DB diff;
- target branch and origin refs verified before commit.

Automated axe was not available in the browser surface; manual DOM/ARIA,
keyboard/focus and console checks are recorded in the visual QA report.
