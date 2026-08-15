# H8 — Release

`FRONTEND_ONLY=NAO` — a entrega inclui migration/modelo backend, portanto exige
release coordenado quando aprovada.

Estado atual: source-ready, sem commit/push/deploy H8 oficial. Railway nao foi
redeployado. A migration PostgreSQL esta presente no repositorio, mas nao foi
aplicada. O alias Vercel oficial esta READY no SHA V66
`44f270d8af5eab514d0c73bdc5f15137359bd525`; não há deployment H8 para
promover. A publicacao deve seguir backup/restore, DB_PRECHECK, migration gate,
canario H8 OFF->tenant QA e smoke autenticado antes do alias oficial.

Evidência de suíte: o focal H8 5/5 e frontend 185/185 passam; a suíte backend
canônica foi executada e falhou somente no teste legado B1
`leads-communication-services-b1.test.js` (mensagens esperadas 2, observadas 0),
reproduzido isoladamente. Nenhuma alteração H8 toca o serviço coberto por esse
teste; a falha permanece pendência de baseline, não foi ocultada.
