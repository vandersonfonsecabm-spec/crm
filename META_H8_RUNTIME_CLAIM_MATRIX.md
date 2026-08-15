# H8 — Matriz de claims

| Claim | Evidencia local | Resultado |
|---|---|---|
| H7_ENGINE_REUSED | worker.js + flag independente | PASS |
| NO_PARALLEL_ALERT_ENGINE | um ciclo do worker chama projector H8 | PASS |
| BADGE_UNREAD_ONLY | summary/list + teste H8 | PASS |
| READ_NOT_RESOLVE | teste markRead/resolve | PASS |
| DEDUPE_PASS | occurrence/dedupe unique + projeto repetido | PASS |
| FOLLOWUP_CANONICAL | Acompanhamento.dataHora/status | PASS |
| SNOOZE_DOES_NOT_CHANGE_DUE | teste venceEm preservado | PASS |
| DEEP_LINK_FOLLOWUP_EXACT | rota e query consumidas pelo Dashboard | PASS |
| TENANT_ISOLATION | gate 91 relacoes / 137 FKs | PASS |
| MOBILE_PASS | CSS preparado; runtime autenticado | NOT_RUN |
| OFFICIAL_SHA_PARITY | nenhum deploy H8 | BLOCKED |
| PRODUCTION_SMOKE | nenhum canario publicado | BLOCKED |

Nenhum claim de producao foi inferido a partir de testes locais.
