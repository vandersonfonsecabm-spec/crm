# Queue selector report

- Native select: `Fila da caixa de entrada`.
- Current default: `Aguardando resposta`; the trusted count is shown in that option.
- Queue selection resets the page to 1 without changing secondary filter semantics.
- `Lembrar depois` remains a queue/view, not a secondary filter.
- Keyboard and native focus behavior were checked in the authenticated browser.
- A screen-reader status announces the current result, including zero results, e.g. `2 conversas em Aguardando resposta.` and `Nenhuma conversa em Minhas.`.

The selector avoids four compressed tabs and keeps the command bar legible at desktop and tablet widths.
