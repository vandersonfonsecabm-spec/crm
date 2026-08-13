# Lifecycle Lock Architecture

Status: `LIFECYCLE_ARCHITECTURE_SHIP` (local RC)

`backend/src/shared/clientLifecycleLock.js` is the single authoritative helper. PostgreSQL obtains a tenant-scoped `SELECT ... FOR UPDATE`; SQLite uses the equivalent tenant-scoped row read because its writer serialization is database-wide. Active-row helpers revalidate archive state and canonical status, sort multiple client IDs for deterministic lock ordering, and fail closed with sanitized lifecycle errors.

Operational writers acquire the client lock inside their final transaction, perform all validation and writes while the lock is held, and keep network/provider calls outside the transaction. Archive, restore, note, delete, inbound, agenda, leads, businesses, proposals, conversations, qualification, automation, simulator, site-lead, customer-360 and projection paths were updated to use the helper or an explicit read-only classification.
