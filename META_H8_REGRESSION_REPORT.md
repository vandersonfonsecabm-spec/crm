# H8 — Regressao

- V63 Inbox: contratos frontend existentes continuam PASS; nenhum endpoint de
  atendimento foi alterado.
- V65 Overview/V66 Movimento recente: nenhum componente ou dado desses blocos
  foi reescrito.
- Agenda: somente leitura focal por ID para deep link; CRUD existente permanece.
- Negocios: somente query de destino; sem formula ou etapa nova.
- Integracoes/providers/outbound: sem delta funcional.
- Banco local: dev.db SHA preservado.

Revalidacao causal no SHA final local `8c5c389`: frontend 186/186, H8 focal
5/5, tenant gate 30/30, backend H8 7/7, TypeScript/Vite PASS. A suíte
backend canônica tem falha legada B1 reproduzida anteriormente; a reexecução
posterior do harness excedeu o timeout operacional.
