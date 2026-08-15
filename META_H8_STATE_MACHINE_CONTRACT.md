# H8 — Estados

Leitura e resolucao sao independentes:

- NOVA: `lidaEm=null`, `resolvidaEm=null`, sem adiamento futuro.
- LIDA: `lidaEm` preenchido, `resolvidaEm=null`.
- ADIADA: `adiadaAte > agora`; sai do badge e da lista principal.
- RESOLVIDA: `resolvidaEm` preenchido; nao reaparece na mesma occurrence.

Transicoes implementadas: marcar uma, marcar todas com cutoff, adiar 30/60/1440
minutos, reativar e resolver. Snooze nunca altera `venceEm` ou `dataHora` do
Acompanhamento.
