# V58 — Release report

## Runtime

- Branch: `feature/postgres-migration-prep`.
- Runtime SHA: `c91976d6538608e527ceb3784e1e4ee0d4d6131f`.
- `origin/feature/postgres-migration-prep`: mesmo SHA.
- `origin/master`: `a0c485885a5f12924d5b3d39b91bbe6db0e4ffd5`.
- Commits V58: `5e36287`, `fc8d0a9`, `ceb1ebf`, `c91976d`.
- Backend não mudou e não foi redeployado.

## Produção

- Frontend oficial: `https://crm-murex-six-83.vercel.app`.
- Deployment Vercel: `dpl_6Qg8JXe6ncoay817CFYTo1fmKMBR` (READY), promovido para os aliases oficiais.
- Frontend HTTP 200; API Railway permaneceu saudável (`/health` HTTP 200).
- Nenhum provider real, outbound ou credencial foi usado.

## Paridade causal

`CAUSAL_RELEASE_PARITY=PASS`: publicação é frontend-only; Railway/backend reutilizado porque nenhum path backend mudou.
