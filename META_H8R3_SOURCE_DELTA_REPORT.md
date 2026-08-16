# H8R3 — Relatório do delta de source

## Motivo

O source H8 anterior não restringia a abertura de settings ao tenant QA durante o período em que a flag global estivesse ligada e não auditava a transição de habilitação. O Sol classificou isso como finding causal `FIX_FIRST` no gate `CANARY_RUNTIME_ACTIVATION`.

## Delta

- Novo parser fail-closed de `H8_NOTIFICATION_TENANT_ALLOWLIST`.
- Guard aplicado aos caminhos API e worker da Central.
- Upsert de settings protegido por transação com `AuditoriaSeguranca` existente.
- `correlationId` gerado por `crypto.randomUUID()` no servidor.
- Nenhuma migration, enum, capability, tela, tipo H8 ou canal externo novo.

## Evidência

- Plano aprovado em `META_H8R3_CANARY_ACTIVATION_PLAN.md`.
- `SOL_H8R3_PRE_DELTA=APPROVED`.
- Teste causal 9/9 PASS em `META_H8R3_DELTA_TEST_REPORT.md`.

## Estado

`SOURCE_DELTA_REQUIRED=YES`

O SHA efetivo final será registrado após revisão Sol do diff e commit explícito somente dos arquivos H8R3 causais. O restante do worktree continua sendo preservado.
