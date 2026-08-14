# V61 — Segurança da identidade interna

## Resultado

PASS no runtime `411c99c04147cb049dbbb7446c6be2e59669ad01`.

O ator `sistema@crm.internal` é uma identidade técnica por tenant, não uma
conta operacional. O helper autoritativo usa a chave composta `empresaId +
email`, repara nome, papel e `ativo=false`, e mantém a senha desabilitada.

## Barreiras

- Login, refresh, reset de senha e sessões administrativas falham fechado.
- `/usuarios` e detalhe administrativo ocultam a identidade.
- Edição, desativação/reativação, reset administrativo e revogação de sessões
  retornam `SYSTEM_ACTOR_RESERVED`.
- Agenda, automações, round-robin, Inbox, Site Leads, Bling e Meta não oferecem
  o ator como responsável/equipe.
- O inbound usa o ator interno para histórico automático sem atribuição humana.

## Evidência

- `backend/tests/user-security.integration.test.js`: 3/3 PASS, incluindo
  adulteração direta, bloqueios HTTP, exclusão de equipe/opções, recuperação
  sem e-mail de reset e reparação canônica pelo inbound.
- `backend/tests/whatsapp-webhook-processing-f1b2.test.js`: 11/11 PASS.
- `backend/tests/inbox-operations-v61.test.js`: 2/2 PASS.
- Nenhum provider real ou outbound foi acionado.
