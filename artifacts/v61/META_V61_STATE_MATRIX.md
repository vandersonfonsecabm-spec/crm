# V61 state matrix

| State | Queue | Reply | Snooze | Resolve | Assignment |
|---|---|---|---|---|---|
| NOVA | eligible when inbound rule applies | lease-gated | yes | yes | assume/assign |
| AGUARDANDO_ATENDIMENTO | awaiting queue | lease-gated | yes | yes | assume/assign |
| EM_ATENDIMENTO | awaiting when aguardandoDesde is active | lease-gated | yes | yes | transfer/release |
| AGUARDANDO_CLIENTE | not awaiting | resume/snooze as allowed | yes | yes | existing lease |
| PENDENTE | excluded until due | resume/re-snooze | reschedule | yes | existing lease |
| ENCERRADA | excluded | no normal reply | no | already resolved | read-only |

Archived and cross-tenant records are excluded by existing lifecycle/tenant scopes.
