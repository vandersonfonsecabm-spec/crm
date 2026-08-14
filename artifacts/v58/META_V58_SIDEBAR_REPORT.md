# V58 — Relatório da sidebar

## Resultado

- Largura expandida: **208 px** (V56/V57: 224 px; redução de 16 px).
- Rail recolhido: **64 px** (V56/V57: 68 px; redução de 4 px).
- O rail mantém marca compacta, badge da Inbox, estado ativo e toggle permanente.
- O toggle recolhido permanece 40×40 px, com `aria-label`/`aria-expanded` e foco visível interno.
- Preferência persistida: Enter e Space alternaram o estado; reload e troca de rota preservaram o rail recolhido.
- Conteúdo recuperado: 156 px no total quando comparado à sidebar expandida de 224 px e rail de 68 px.

## Evidência autenticada

Em produção oficial, zoom 100%:

| Viewport | Estado | Sidebar | Inbox x/w | Body overflow |
|---|---:|---:|---:|---:|
| 1366×768 | expandida | 208 | x=218 / 1138,4 | 0 px |
| 1366×768 | recolhida | 64 | x=74 / 1282,4 | 0 px |
| 1440×900 | expandida | 208 | x=218 / 1212 | 0 px |
| 1440×900 | recolhida | 64 | x=74 / 1356 | 0 px |

O gap técnico sidebar→Inbox foi 10 px em todos os quatro estados. A margem direita também foi 10 px.

## Arquivos relacionados

- `frontend/src/index.css`
- `frontend/src/components/dashboard/DashboardSidebar.css`
- `frontend/src/components/dashboard/DashboardSidebar.tsx`
- `frontend/tests/v56-desktop-shell-inbox.test.mjs`

## Advisory não bloqueante

O breakpoint herdado entre 1023/1024 px ainda troca o shell desktop/mobile de forma abrupta. A missão V58 exige QA focal em 1440/1366/390; o comportamento foi registrado e não foi ampliado para um redesenho tablet.
