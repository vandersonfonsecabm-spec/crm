# E5R official database precheck

PRODUCTION_DB_PRECHECK=PASS
DATABASE=railway
POSTGRES_VERSION=18.6
DATABASE_TIMEZONE=Etc/UTC
RECOVERY_MODE=false
LOCKS_NOT_GRANTED=0
DATABASE_SIZE=15MB
PUBLIC_BASE_TABLES=53
STOCK_TABLES_BEFORE_MIGRATION=0

Applied migration history (11):

`20260728090000_postgres_baseline`, `20260730160000_add_instagram_direct_schema_foundation`, `20260731120000_add_messenger_direct_schema_foundation`, `20260731190000_add_email_inbound_foundation`, `20260801123000_enforce_tenant_safe_relations`, `20260801150000_add_user_security_foundation`, `20260811120000_add_meta_credential_store`, `20260811130000_add_meta_oauth_state_binding`, `20260813150000_add_customer_archive`, `20260815120000_add_h8_notifications`, `20260823152000_add_distributed_rate_limit`.

Expected pending stock migrations are exactly:

`20260823180000_add_stock_core_e2`
`20260823200000_add_stock_rules_h8_projection`

MIGRATION_HISTORY_PARITY=PASS_FOR_PENDING_STOCK_SET
NO_PARTIAL_MIGRATION=PASS
H7_H8_AND_RATE_LIMIT_PRESENT=PASS
REPRESENTATIVE_COUNTS_PRESERVED_BEFORE_MIGRATION=PASS (Empresa=2, Usuario=3, Notificacao=15, RateLimitBucket=7)
