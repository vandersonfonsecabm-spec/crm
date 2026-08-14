# V58 — Uso de espaço da Inbox

## Métricas autenticadas reais

### 1366×768

- Expandida: workspace x=218, y=114, w=1138,4, h=644, right=1356,4, bottom=758.
- Recolhida: workspace x=74, y=114, w=1282,4, h=644, right=1356,4, bottom=758.
- Com contexto: lista 284,2; Chat 568,4; contexto 284,2.
- Recolhida com contexto: lista 320,2; Chat 640,4; contexto 320,2.
- Composer: base y=757,2, dentro da viewport.

### 1440×900

- Expandida: workspace x=218, y=114, w=1212, h=776, right=1430, bottom=890.
- Recolhida: workspace x=74, y=114, w=1356, h=776, right=1430, bottom=890.
- Expandida com contexto: lista 302,6; Chat 605,2; contexto 302,6.
- Recolhida com contexto: lista 338,6; Chat 677,2; contexto 338,6.
- Composer expandido: y=706,4–889,2; composer recolhido: y=706,4–889,2.
- Histórico de mensagens manteve scroll interno próprio.

## Critérios V58

- `INBOX_FULL_WIDTH=PASS`: gutters externos 10/10 px nos desktops obrigatórios.
- `INBOX_FULL_HEIGHT=PASS`: workspace ocupa a faixa útil até 10 px da base.
- `RIGHT_EMPTY_SPACE=PASS`: nenhuma coluna fantasma nos estados com contexto.
- `BOTTOM_EMPTY_SPACE=PASS`: somente respiro funcional de 10 px.
- `CHAT_SCROLL_INTERNAL=PASS`: histórico e colunas usam overflow interno.
- `COMPOSER_BOTTOM_ANCHORED=PASS`: composer dentro do workspace e visível sem scroll do documento.
- `INBOX_SCROLL_MODEL=PASS`: `scrollWidth=clientWidth` em 1366 e 1440.

## Implementação

O frame específico `.crm-content--inbox` usa 8/10/10 px na cascata efetiva, `min-width:0`, `min-height:0`, flex vertical e grids 25/75 sem contexto e 25/50/25 com contexto. Outras páginas mantêm seus containers.

## Limitações registradas

- O topbar global conserva alinhamento interno de 32 px, enquanto a Inbox workbench inicia a 10 px; essa decisão privilegia ocupação da Inbox e não altera as demais páginas.
- Em telas compactas a Inbox usa drawer de contexto progressivo, preservando o comportamento anterior.
