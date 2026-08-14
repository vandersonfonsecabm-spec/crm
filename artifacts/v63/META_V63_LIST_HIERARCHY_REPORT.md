# Conversation list hierarchy

- Row line 1: contact name and contextual time.
- Row line 2: channel and responsible party as low-noise metadata.
- Row line 3: preview, capped to two lines.
- One exceptional operational indicator is favored; multiple indicators are not rendered as a badge wall.
- Lease visibility is retained even when SLA/reminder information is also present.
- Reminder rows update overdue state with a bounded 30-second ticker and expose an accessible full timestamp.
- Selected rows retain their existing selected/`aria-current` treatment.

This is a presentation-only refinement; list ordering and queue calculation remain server-defined V61 behavior.
