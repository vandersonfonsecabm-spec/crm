# V54 Post-release Backup

Status: `PASS`

- Private path: `C:\Users\vande\.crm-agro-release-backups\v54-post-release\post-release-production.dump`.
- Custom format `pg_dump -Fc --no-owner --no-privileges`; size 328414 bytes; exit 0.
- SHA-256: `66090e5cc66f594224141a8030fe1674bd29557cbb8eddbfc4703fe171267927`.
- `pg_restore --list` passed against the official PostgreSQL service; the dump is outside the repo and excluded from ZIPs.
