# V58 — Hierarquia do contexto do cliente

O painel direito deixou de parecer uma ficha plana e foi reagrupado em blocos sem alterar dados ou endpoints:

1. **Identidade** — nome, empresa, telefone, e-mail e interesse.
2. **Atendimento** — responsável, canal, status, última atividade e próximo acompanhamento.
3. **Comercial** — etapa, prioridade/temperatura, negócio e valor quando existente.
4. **Origem** — campanha, fonte e origem, em disclosure secundário.
5. **Histórico de atendimento** — eventos recentes e alterações preservados.

O bloco essencial permanece aberto primeiro; informações secundárias usam disclosures. Labels repetidos foram removidos. No drawer compacto, o `aria-controls="inbox-conversation-context"` agora referencia o `aside[role=dialog]` real; no desktop o mesmo ID pertence ao painel inline, sem duplicação porque os modos são mutuamente exclusivos.

Valores longos (inclusive URLs sem espaços) recebem `min-width:0`, `overflow-wrap:anywhere` e `word-break:break-word`, cobrindo o painel inline e o drawer compacto.

Regressões preservadas: seleção, polling, ações da conversa, contexto comercial, composer, permissões e bloqueio de outbound.
