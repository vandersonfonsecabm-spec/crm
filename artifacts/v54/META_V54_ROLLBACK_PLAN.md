# V54 Rollback Plan

`ARCHIVE_WRITE_ACTIVATION_MODE=V54 backend and frontend deployed and healthy before any official archive write; production pre/post counts prove zero lifecycle writes during cutover.`

- Before the first archive write, a code-only rollback to Mark A is allowed only if writes are paused and authoritative checks prove `arquivadoEm IS NOT NULL = 0`, `status='Arquivado' = 0` and `statusAntesDeArquivar IS NOT NULL = 0`. After migration, this is a temporary read-only compatibility fallback, not a normal operating state.
- After migration, V50 is not a semantic rollback target. If archive/restore writes exist, use a V54-compatible forward hotfix; never reinterpret `arquivadoEm` with the old application.
- A production restore is forbidden for testing. Recovery requires a verified backup, a write-loss assessment, and Sol approval under the release protocol.
- The pre-release dump is retained privately outside the repository. No rollback was executed during local validation.
