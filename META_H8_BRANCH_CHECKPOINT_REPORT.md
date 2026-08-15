# H8 — Branch e checkpoints

- Base: `feature/postgres-migration-prep` em `44f270d8af5eab514d0c73bdc5f15137359bd525`.
- Checkpoint de schema/gate: migration aditiva + registro tenant.
- Checkpoint de backend: servico/rotas/worker com flag OFF.
- Checkpoint de frontend: sino, painel, configuracoes e deep links.
- Checkpoint de testes: tenant 30/30, backend H8 7/7, frontend 186/186.
- Commit local do checkpoint: `2ceffec` (`feat(h8): add gated in-app notification center`).
- O commit ainda não foi promovido a `master` nem publicado; o alias oficial
  permanece no runtime V66.

Nenhum reset, rebase, force push ou alteracao em master foi executado.
