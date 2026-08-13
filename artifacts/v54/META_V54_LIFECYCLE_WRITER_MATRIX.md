# Lifecycle Writer Matrix

| Family | Guard | Boundary | Status |
|---|---|---|---|
| Cliente archive/restore/update/delete | `lockClienteRow` + tenant/CAS/status | final transaction | GUARDED |
| Notes and customer timeline | `lockActiveClienteRow` | final transaction | GUARDED |
| Agenda/follow-up projection | active-client lock before mutation | service transaction | GUARDED |
| Leads/assume/assign/queue/conversion | active-client lock and CAS | service transaction | GUARDED |
| Negócios and propostas | active-client lock before stage/status/write | service transaction | GUARDED |
| Conversas/inbox/qualification | contact/lead client lock; provider I/O outside tx | service transaction | GUARDED |
| Email/WhatsApp/Messenger/Instagram/Site inbound | active-client resolution and lock | processor transaction | GUARDED |
| Automations and TEST_ONLY simulator | execution-time active guard and lock | worker transaction | GUARDED |
| Customer 360 and follow-up projection | active-client lock/CAS | service transaction | GUARDED |
| Read-only lists and summaries | tenant/archive relation filters | read-only query | NOT_APPLICABLE_READ_ONLY |

No operational writer remains `UNKNOWN` in the audited matrix. Full backend tests and the PostgreSQL lock proof are the evidence gates for this table.
