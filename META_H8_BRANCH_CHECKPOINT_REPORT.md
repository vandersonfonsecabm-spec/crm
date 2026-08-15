# H8 — Branch e checkpoints

- Base: `feature/postgres-migration-prep` em `44f270d8af5eab514d0c73bdc5f15137359bd525`.
- Checkpoint de schema/gate: migration aditiva + registro tenant.
- Checkpoint de backend: servico/rotas/worker com flag OFF.
- Checkpoint de frontend: sino, painel, configuracoes e deep links.
- Checkpoint de testes: tenant 30/30, backend H8 7/7, frontend 186/186,
  H8 focal 5/5.
- Commits locais posteriores fecharam lifecycle/GET/deep-link/foco:
  `54cad1f`, `c405904`, `cd56e3d`, `3446c65`, `8c5c389`.
- SHA final local auditado: `8c5c389`.
- O commit ainda não foi promovido a `master` nem publicado; o alias oficial
  permanece no runtime V66.

Nenhum reset, rebase, force push ou alteracao em master foi executado.
