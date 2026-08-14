# V58 — QA visual e acessibilidade

## Escopo executado

- Sessão autenticada existente no Chrome, produção oficial, zoom 100%.
- 1440×900: Inbox expandida e recolhida.
- 1366×768: Inbox expandida e recolhida.
- 1280×800: drawer compacto de contexto, IDREF/ARIA, foco e scroll lock.
- 390×844: sentinel mobile, sem redesenho mobile.

## Resultados

- Sidebar 208/64, toggle por click/Enter/Space, `aria-expanded` correto e persistência por reload/rota.
- Inbox full-workspace: Chat é maior que lista e contexto; composer ancorado; scroll interno; sem clipping ou sobreposição.
- `body.scrollWidth === body.clientWidth` nos quatro estados desktop e no sentinel horizontal mobile.
- Drawer compacto: `aria-controls` resolve para o diálogo, foco inicial no fechamento, Escape fecha, body overflow retorna e foco volta ao trigger.
- Console final: nenhum erro ou aviso capturado.
- Mobile sentinel: rail desktop oculto, navegação mobile presente, sem overflow horizontal.

## Evidências visuais

Os captures estão em JPEG reais (a superfície de captura do navegador devolve bytes JPEG mesmo quando o nome solicitado termina em `.png`):

- `V58_AFTER_1440_EXPANDED.jpg`
- `V58_AFTER_1440_COLLAPSED.jpg`
- `V58_AFTER_1366_EXPANDED.jpg`
- `V58_AFTER_1366_COLLAPSED.jpg`
- `V58_AFTER_390_SENTINEL.jpg`

Os arquivos `.png` correspondentes foram preservados apenas como referência histórica da captura; os anexos recomendados são os `.jpg`.

## Limitação honesta

Não havia pacote axe automatizado disponível na sessão. A validação foi manual via DOM/ARIA, teclado, foco, overflow e console; portanto `AXE_AUTOMATED_RUN=NOT_AVAILABLE`, sem transformar isso em um falso PASS automatizado.
