# H8 — Rollback

Rollback preferido: desabilitar `NOTIFICATIONS_WORKER_ENABLED` e a configuracao
H8 do tenant, manter tabelas aditivas inertes e retornar frontend/backend ao
runtime anterior. Nao dropar tabelas em emergencia. Baseline funcional visual:
V66 `44f270d8af5eab514d0c73bdc5f15137359bd525`.

Como a migration oficial ainda nao ocorreu, nenhum rollback de producao foi
executado. O alvo exato do deployment V66 devera ser registrado no canario.
