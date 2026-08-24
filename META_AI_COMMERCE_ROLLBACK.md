# Rollback E6A

Rollback lógico, sem down migration:

1. `AI_COMMERCE_ENABLED=false`;
2. `AI_COMMERCE_SHADOW_WORKER_ENABLED=false`;
3. `AI_COMMERCE_MOCK_ENABLED=false`;
4. limpar allowlist tenant;
5. cancelar runs pendentes e rejeitar drafts por revisão/CAS;
6. preservar audit/idempotency;
7. voltar ao runtime anterior identificável `a1232a1`/tag stock;
8. manter schema aditivo e H7/H8/stock intactos.

Compatibilidade foi verificada por startup do runtime com flags OFF, rehearsal
em cópia isolada e health/ready após o deployment oficial. O deployment
anterior ao merge permanece identificável no histórico Railway/Vercel; não foi
necessário acioná-lo porque não houve incidente. O backup lógico protegido e o
restore isolado também estão disponíveis para recuperação sem down migration.

`AI_COMMERCE_ROLLBACK_COMPATIBILITY=PASS_LOCAL`
`AI_COMMERCE_ROLLBACK_AVAILABLE=PASS_LOGICAL_AND_PREVIOUS_DEPLOYMENT_IDENTIFIED`
