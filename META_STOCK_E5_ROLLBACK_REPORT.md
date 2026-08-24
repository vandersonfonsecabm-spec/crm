# E5 rollback report

Official rollback drill: NOT_EXECUTED.
Source rollback remains additive: disable `STOCK_H8_PROJECTION_ENABLED`, `STOCK_RULE_ENGINE_ENABLED`, `STOCK_SYNC_WORKER_ENABLED`, `STOCK_SOURCE_ENABLED`, remove tenant allowlist and preserve outbox/audit/checkpoint. No down migration is required or authorized.
