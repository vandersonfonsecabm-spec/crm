# V61 Inbox workflow contract

## Queue semantics

Aguardando resposta contains an eligible conversation whose last relevant
activity requires human treatment, is not closed/archived/snoozed and belongs to
the current tenant. Multiple inbound messages count once. Opening does not clear
the queue; a confirmed treatment, resolution or snooze does.

## Views

- Aguardando resposta (default)
- Todas
- Minhas
- Não atribuídas
- Prioridade/SLA
- Lembrar depois

All views retain server pagination and tenant scope. The operational next action
does not require manually visiting page 2.

## Actions

Assignment uses the existing responsible/lease model. Próxima pendência selects
the next eligible item in the active ordering. The simulated Enviar e próxima
path waits for local confirmation and never calls a real provider.

## Reminder

Lembrar depois is server-side through the existing Acompanhamento relation.
The same reminder can be rescheduled; its due time synchronizes the conversation
operational timestamp. A failed CAS aborts the state change.
