# H8 — Ciclo de vida

| Tipo | Abertura | occurrence/dedupe | Resolucao | Destino |
|---|---|---|---|---|
| NOVA_MENSAGEM | conversa em needsAttention | `conversation:<id>` | tratamento real/estado deixa de exigir resposta | Conversa |
| ACOMPANHAMENTO | antecedencia alcancada ou vencimento | `follow-up:<id>:<dataHora ISO>` | concluido, cancelado ou reagendado | Acompanhamento |
| LEMBRETE_ACOMPANHAMENTO | Acompanhamento de retorno na janela | mesma identidade do acompanhamento | ciclo do Acompanhamento | Acompanhamento |

Novo inbound material reabre a mesma conversa como nao lida; polling/re-render
nao reabre. Reagendamento encerra a occurrence antiga e arma a nova.
