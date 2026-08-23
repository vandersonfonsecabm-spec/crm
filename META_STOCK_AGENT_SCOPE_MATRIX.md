# Stock MVP agent scope matrix

CURRENT_STATE_AS_OF=2026-08-23
RUNTIME_TOTAL_AGENT_SLOTS=8
RUNTIME_MAX_SUBAGENTS=7
PEAK_SIMULTANEOUS_AGENTS=4
AGENTS_ACTUALLY_USED=6
OVERLAPPING_FILE_MUTATIONS=0
DUPLICATE_FULL_SUITES=0
MULTI_AGENT_ADAPTATION=PASS

| Papel | Escopo | Evidência |
|---|---|---|
| A0 root | integração, gates, commits e relatórios | branch integrada |
| A1 E2R | schema/runtime safety e revisão causal | focused E2R tests |
| A2 E3 | regra/evaluation/projection | `backend/src/stock/rules.js`, `rule-service.js`, `projection.js` |
| A3 E4 | painel, API client e navegação stock | `StockControlPanel.tsx`, frontend focal |
| A4 security | tenant/H8/worker review | findings reconciliados |
| A5 reliability | outbox/sync/lease review | safety tests |
| A6 release review | source-ready gate | review E2 reutilizada |

Mutations ficaram isoladas por arquivo; reviewers não editaram o escopo de outros owners.
