# H8 — Baseline H7

O H7 atual possui regras, eventos duraveis, jobs com idempotencia, lease, retry,
capability e worker dedicado. A Central nao reutiliza `AutomacaoEventoInterno`
como armazenamento de notificacao, pois esse modelo nao possui destinatario,
leitura, adiamento ou resolucao.

Auditoria determinou que o scanner temporal H7 nao tem caller de producao e que
seus defeitos de cursor/lease/retry nao devem ser ativados indiretamente. A H8
usa a mesma infraestrutura/processo do worker, mas um projetor bounded proprio,
guardado por `NOTIFICATIONS_WORKER_ENABLED` e pela configuracao deny-by-default
da empresa. Nenhuma regra H7 e ligada por esta alteracao.
