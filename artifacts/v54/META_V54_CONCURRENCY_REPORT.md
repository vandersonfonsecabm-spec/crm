# V54 PostgreSQL Concurrency Report

Status: PASS (TEST_ONLY)

- Target: private Railway PostgreSQL TEST_ONLY database `v54_restore_test`, PostgreSQL 18.4.
- Writer-first interleaving: writer acquired the Cliente row lock, held it, and committed its synthetic note before archive acquired the lock.
- Archive then committed; a subsequent writer transaction revalidated `arquivadoEm` and failed closed.
- Observed proof markers: `LIFECYCLE_CONCURRENCY_GATE=PASS`, `ZERO_WRITE_AFTER_ARCHIVE=PASS`, `ZERO_CROSS_TENANT=PASS`, `ZERO_UNBOUNDED_LOCK=PASS`.
- Synthetic proof left one note before cleanup and restored the row; the private TEST_ONLY database was dropped and verified absent.
- No provider/network I/O was executed inside the lock transaction.
