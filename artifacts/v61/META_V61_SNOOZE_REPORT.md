# Snooze / remind-later report

Reminders are persisted with the existing Acompanhamento model and are visible
in the Lembrar depois queue and row metadata. Re-snooze is valid for an already
pending conversation. Agenda edits of the same V61 reminder, including a changed
dataHora, synchronize aguardandoDesde in the linked conversation. Reminder CAS
losses fail closed and prevent partial history/state updates. No localStorage
reminder was used.
