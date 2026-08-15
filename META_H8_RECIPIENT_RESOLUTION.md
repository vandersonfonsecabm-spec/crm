# H8 — Destinatarios

1. Acompanhamento/conversa com responsavel ativo do mesmo tenant: somente esse usuario.
2. Sem responsavel: usuarios ativos com papel ADMIN ou GERENTE do mesmo tenant.
3. Usuario desativado ou com preferencia desabilitada nao recebe nova occurrence.
4. Nao existe envio para todos os usuarios do tenant por padrao.

Essa politica e implementada em `backend/src/notifications/service.js` e coberta
por isolamento de tenant no teste H8.
