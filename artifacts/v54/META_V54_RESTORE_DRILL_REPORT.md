# V54 Restore Drill

Status: `BACKUP_AND_RESTORE_PROOF_V54=PASS`

- Exact pre-release dump restored with `pg_restore --exit-on-error --no-owner --no-privileges` into private PostgreSQL TEST_ONLY.
- Pre-restore structural checks passed: migration history present, no Empresa/Nota orphans, tenant structure readable without row export.
- The restored database was migrated and verified, then destroyed. No public frontend or provider was connected to it.
- Post-rehearsal sanitized invariants: V52 columns 2; invalid status 0; archive invariant 0; Nota/Empresa orphans 0; Nota FK delete action `r`; active locks 0.
