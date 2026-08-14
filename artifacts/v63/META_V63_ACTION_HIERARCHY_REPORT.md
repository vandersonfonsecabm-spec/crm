# Action hierarchy report

- `Próxima pendência` remains a secondary, clearly labeled chat-header action.
- Composer primary action remains `Enviar`.
- `Enviar e próxima` remains available with existing simulated/outbound-safe behavior and lease/idempotency guards.
- `Mais` contains secondary assignment, state, reminder, return-to-queue, resolve/reopen actions.
- Pagination labels are explicitly `Página anterior` and `Próxima página`, eliminating the old ambiguity with operational `Próxima`.
- Existing confirmation, permissions, disabled/busy states, focus restoration, and error handling were preserved.
