# V54 Pre-release Backup Report

Status: PASS

- Logical backup: private path `C:\Users\vande\.crm-agro-release-backups\v54-pre-release\pre-release-production.dump`.
- Format: custom `pg_dump -Fc`, no owner/privilege metadata.
- Exit status: 0; file is non-empty and SHA-256 sidecar is retained beside the dump.
- The dump is outside the repository and excluded from all reports/ZIPs.
- Provider-native snapshot availability was not assumed; the logical backup is the verified recovery artifact.
- Size: 327836 bytes. SHA-256: `38c7b7fb186d0ee566181b8d0ac155eddb921b4dc345dafeb6265cc9b31a6093`.
- `pg_restore --list` passed; the exact dump was restored privately and migrated successfully before production mutation.
