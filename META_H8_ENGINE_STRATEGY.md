# H8 — Estrategia de engine

`H8_EVENT_ENGINE_STRATEGY=REUSE_H7`

- Processo, ciclo de polling, shutdown e observabilidade reutilizam o worker H7.
- `NOTIFICATIONS_WORKER_ENABLED` e independente de `AUTOMATION_WORKER_ENABLED`.
- A projecao H8 le fontes canonicas duraveis (Conversa/Acompanhamento) e usa
  upsert por occurrence/dedupe; nao cria cron paralelo, setInterval de dominio,
  scanner sem lease ou segundo job engine.
- A flag permanece desligada por padrao. O worker nao gera outbound.
- A ativacao ampla fica bloqueada ate canario controlado com um tenant e uma
  replica, apos backup/restore e verificacao do PostgreSQL.
