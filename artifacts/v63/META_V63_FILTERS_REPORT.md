# Filters report

- Secondary filters remain in the existing drawer and API contract.
- Queue scope is no longer duplicated as a drawer filter.
- Clearing secondary filters does not silently move the operator to another queue.
- Filter trigger retains `aria-expanded`/`aria-controls`; the drawer relation resolves to one dialog.
- Existing priority/SLA, channel, responsible, state, lead, and search refinements remain available.
- Empty and error paths retain their existing retry behavior.

No filter endpoint, schema, or backend behavior changed.
