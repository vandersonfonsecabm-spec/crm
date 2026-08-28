# STORE-1 — Matriz canônica de readiness

| Área | Fundação interna | Runtime staging | Provider real | Outbound | Estado |
|---|---|---|---|---|---|
| Núcleo CRM | PASS | PASS | N/A | 0 | PASS |
| WhatsApp Meta | PASS | worker/intake PASS | não conectado | 0 | FOUNDATION_READY |
| Instagram Meta | PASS | worker/intake/OAuth gate PASS | não conectado | 0 | FOUNDATION_READY |
| Messenger Meta | PASS | worker/intake PASS | não conectado | 0 | FOUNDATION_READY |
| Bling | lock/OAuth/sync PASS | PASS | conta não conectada | 0 | READY_FOR_ACCOUNT_CONNECTION |
| E-mail | outbox/crypto/retry PASS | foundation OFF | adapter não escolhido | 0 | PENDING_PROVIDER_ADAPTER |
| IA | connector/HMAC/timeout PASS | provider OFF | adapter não escolhido | 0 | PENDING_PROVIDER_ADAPTER |
| Workers | checkpoint/restart/watchdog PASS | worker SUCCESS | N/A | 0 | PASS |
| UI de integrações | estados verdadeiros PASS | browser PASS | nenhum falso conectado | 0 | PASS |
| PostgreSQL | migrations/CAS/locks PASS | migration aplicada | N/A | 0 | PASS |
| Soak 4h15 | runner/guard/lease PASS | 255 min + restart + cleanup PASS | N/A | 0 | PASS |

## Gates de segurança

```text
CROSS_TENANT_VIOLATIONS=0
ROLE_BYPASSES=0
DATA_INTEGRITY_FAILURES=0
FALSE_CONNECTED_STATES=0
PRODUCTION_REQUESTS_DURING_QA=0
PROVIDER_EGRESS=0
REAL_PROVIDER_CONNECTIONS=0
REAL_PROVIDER_CREDENTIALS_USED=0
REAL_OUTBOUND=0
SOAK_REQUESTS=5560
SOAK_FAILURES=0
SOAK_HTTP_5XX=0
SOAK_RESTART=PASS
SOAK_CLEANUP=PASS
```
