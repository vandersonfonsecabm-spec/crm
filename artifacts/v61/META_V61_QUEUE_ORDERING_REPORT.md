# Queue ordering report

The backend orders operational candidates by explicit priority first, then the
oldest response-wait timestamp, followed by a stable id tie-breaker. Reminder
views order by due time. Message chronology uses COALESCE(enviadaEm, createdAt)
so legacy rows without provider timestamps remain chronologically usable on both
SQLite and PostgreSQL. Null ordering is explicit and covered by the V61 sandbox.
