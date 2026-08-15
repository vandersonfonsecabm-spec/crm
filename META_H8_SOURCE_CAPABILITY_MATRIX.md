# H8 — Matriz de fontes

| Tipo | Fonte canonica | Destino | Destinatario | Estado |
|---|---|---|---|---|
| Nova mensagem | `ConversaCanal.needsAttention`/status e timestamps | Conversa exata | responsavel ativo; fila cai em ADMIN/GERENTE | SUPPORTED |
| Acompanhamento proximo/atrasado | `Acompanhamento.dataHora/status` | Acompanhamento exato | responsavel; fallback ADMIN/GERENTE | SUPPORTED |
| Lembrete manual | Acompanhamento existente | Acompanhamento exato | responsavel | SUPPORTED |
| Negocio parado | regra H7 temporal, sem caller seguro | Negocio | — | NOT_SUPPORTED nesta entrega |
| Cliente sem contato | `Cliente` nao possui responsavel canonico para este alerta | Cliente | — | NOT_SUPPORTED |
| Produto desatualizado/incompleto | tabelas locais nao tenant-scoped e rotas 410 | Produto | — | NOT_SUPPORTED |
| Proposta vencendo | prazo existe, mas projetor H8 V1 nao foi habilitado | Proposta | — | NOT_SUPPORTED |

Nenhuma linha NOT_SUPPORTED cria placeholder ou metrica falsa.
