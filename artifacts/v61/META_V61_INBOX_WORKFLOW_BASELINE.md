# V61 Inbox workflow baseline

## Existing model

- `ConversaCanal.status`: `NOVA`, `AGUARDANDO_ATENDIMENTO`, `EM_ATENDIMENTO`, `AGUARDANDO_CLIENTE`, `PENDENTE`, `ENCERRADA`.
- `aguardandoDesde` is the server timestamp for the current response-waiting interval.
- `respostaReservadaPorId` / `respostaReservadaAte` are the existing reply lease.
- `responsavelId` is the authoritative assignment.
- `Acompanhamento.dataHora` and `conversaCanalId` already provide a server-side return/reminder relation; no new schema field is required.
- `/conversas/resumo` currently counts pending conversations, not messages.

## Current gaps recorded before edits

- list query had only `todas`, `minhas` and `sem-responsavel`; no first-class awaiting queue or stable oldest-wait ordering.
- no next-pending or send-and-next affordance.
- pending state had no scheduled return UI.
- message timestamps were bare text and did not expose a full accessible datetime.

## Preservation constraints

- no provider network or real outbound is used; simulated reply remains the safe fixture path.
- tenant/archive scopes, lease/CAS transitions, polling, attachments and existing integrations remain unchanged.
- V58 shell and mobile navigation are not redesigned.
