# Matriz de claims de runtime — GA3

CURRENT_STATE_AS_OF=2026-08-25 BRT
START_SOURCE_SHA=25b36e639612275abc826f36f8f89a66fd06701a
CURRENT_SOURCE_SHA=cf7e87f961b05996d4e806ab7bcfd657b2b111f0
FINAL_RUNTIME_SHA=cf7e87f961b05996d4e806ab7bcfd657b2b111f0
DOCUMENT_STATUS=GA3_COMPONENT_PARITY_RECONCILED

| Claim | Estado | Evidência |
|---|---|---|
| SOURCE_IDENTITY | PASS_COMPONENT | runtime code tag `cf7e87f`; master/release are documentation-only overlays; exact branch ref is read from Git at delivery; worktree limpo |
| OFFICIAL_SHA_PARITY | PASS_COMPONENT | Railway API `6fe8c55f` e worker `e9fcc843` em `cf7e87f`; Vercel `dpl_65YL...` READY em `a3c0600`, com árvore frontend idêntica entre os SHAs |
| DATABASE_INTEGRITY | PASS | PostgreSQL oficial healthy; 16 migrations, 0 pendentes, locks 0 |
| TENANT_ISOLATION | PASS | gates isolados sem órfãos/cross-tenant; context resolver e IDs tenant-scoped |
| AUTHORIZATION | PASS | auth/RBAC, AI route roles e approval CAS testados |
| AI_FINAL_OFF | PASS | AI enabled=false, mock=false, canary=false, allowlist=0 |
| META_REAL_CHANNELS | PASS_OFF | worker sem vars de canal; processors testados sem outbound |
| OUTBOUND | PASS_ZERO | nenhuma rota/caminho de AI/Meta realizou envio |
| BACKEND_FULL_SUITE | PASS | runner SQLite sandbox exit 0; contagem detalhada não foi inventada pelo wrapper |
| E6A_FOCUSED | PASS | 45/45 após integração de segurança/catálogo/tools/replay/redaction |
| FRONTEND_FULL_SUITE | PASS | 195/195; build e lint PASS |
| WORKER_HEALTH | PASS | stock cycles 200–280 ms, failedCount 0 |
| QUERY_OBSERVABILITY | PASS_CONTROLLED | janela ON/OFF, sem slow/error events; sem sampling probabilístico |
| PG_STAT_STATEMENTS_LIVE | BLOCKED_EXTERNAL | script read-only pronto, extensão/cluster temporário não disponível |
| POSTGRES_REAL_REHEARSAL | BLOCKED_EXTERNAL | Docker/URL descartável ausentes; runner falha fechado e limpa |
| CHECKPOINT_LATENCY | ADVISORY_OPEN | outlier histórico ~247s, sem reincidência/causa comprovada |
| ROLLBACK | PASS_AVAILABLE | deploy anterior e tags/release refs permanecem recuperáveis |

Claims BLOCKED_EXTERNAL/ADVISORY não são convertidos em PASS por ausência de erro.
