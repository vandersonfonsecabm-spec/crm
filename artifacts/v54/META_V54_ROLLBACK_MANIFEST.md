# V54 Rollback Manifest

- Mark A: `1be75d9e70047cda98464348a30b62173d4bb0a4`.
- Pre-release backup: private custom-format dump recorded in `META_V54_BACKUP_REPORT.md`.
- Compatibility: code-only V50 rollback is permitted only while writes are paused and authoritative archive/status counts are all zero; after any archive lifecycle write, use V54-compatible forward recovery.
- Cutover evidence: production post-migration invariant checks found zero `arquivadoEm`, zero `status='Arquivado'` and zero `statusAntesDeArquivar` rows before V54 operation was reopened.
- No rollback was executed.
