# V63 UI contract

## Command bar

- One title: `Caixa de entrada`.
- One queue selector: `Fila da caixa de entrada`.
- Queue options remain `Aguardando resposta`, `Minhas`, `Não atribuídas`, `Todas`, `Lembrar depois`, and `Prioridade / SLA`.
- Secondary `Filtros` stays separate and preserves existing refinements.
- Refresh remains tertiary.
- Tablet uses a two-row command layout; mobile uses the existing compact layout.

## Rows and actions

- Contact and operational time lead the row.
- Channel and responsible party are plain metadata.
- Preview stays readable; exceptional state is limited to one primary indicator while another operator's lease remains visible.
- `Próxima` is the operational action with accessible name `Abrir próxima pendência`.
- Pagination says `Página anterior` and `Próxima página`.
- Secondary actions remain in `Mais`; `Pendente sem prazo` and `Agendar lembrete` clarify distinct intent.

## Preservation

The implementation does not change queue semantics, API mappings, lease/CAS, timestamps, outbound simulation, context data, or mobile navigation.
