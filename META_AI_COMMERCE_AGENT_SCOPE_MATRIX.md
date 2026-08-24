# E6A agent scope matrix

CURRENT_STATE_AS_OF=2026-08-24
RUNTIME_TOTAL_AGENT_SLOTS=8_CONFIGURED
EFFECTIVE_AGENT_SLOTS=8
PEAK_SIMULTANEOUS_AGENTS=5

| Role | Ownership | Mode |
|---|---|---|
| Root | integration, decisions, gates, reports | mutator/integrator |
| Catalog database | schema, catalog, availability, search, offer | exclusive mutator |
| Orchestrator/tools | connection port, Mock, policy, audit, orchestration | exclusive mutator |
| Inbox/UI | existing Inbox integration and settings/catalog UI | exclusive mutator; interface-design required |
| Security/reliability | review, tests, no edits unless delegated | read-only reviewer |
| Release/Sol | source/migration/runtime review | read-only reviewer |

OVERLAPPING_FILE_MUTATIONS=0
DUPLICATE_FULL_SUITES=0
