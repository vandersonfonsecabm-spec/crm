# GA3 — otimização focal do bundle frontend

Data: 25/08/2026
Branch: `feature/ga3-bundle-slice`
Commit local: `232c7f6`

## Objetivo

Reduzir o JavaScript carregado no bootstrap inicial sem redesign, mudança de
rota, mudança de autenticação ou alteração de contrato backend.

## Mudança aplicada

`frontend/src/App.tsx` passou a carregar `Dashboard` com `React.lazy` apenas
depois de a sessão ser validada. O `Dashboard` mantém exatamente as mesmas
props (`initialAuthSession` e `onLogout`).

Foram adicionados estados seguros para o chunk:

- loading acessível com `aria-busy` e `role=status`;
- boundary de erro com `role=alert`;
- retry por reload, preservando a sessão por cookie/token existente;
- nenhuma mudança de layout das telas do Dashboard.

Teste estático `frontend/tests/ga3-bundle-split.test.mjs` protege o split,
props, fallback e recuperação.

## Métricas antes/depois

| Métrica | Antes | Depois |
|---|---:|---:|
| JS inicial minificado | 869,25 kB | 284,05 kB |
| JS inicial gzip | 231,30 kB | 88,83 kB |
| Redução inicial | — | 585,20 kB / 67,3% minificado / 61,6% gzip |
| Dashboard diferido | — | 589,26 kB / 145,19 kB gzip |

O total transferível não desaparece; parte dele foi movida para o primeiro
acesso autenticado ao Dashboard. O ganho medido é no bootstrap inicial e nas
rotas públicas/login.

## Validações

- frontend global: `198/198 PASS`;
- teste de autenticação focado: `19/19 PASS`;
- build TypeScript/Vite: PASS;
- lint: PASS;
- `git diff --check`: PASS;
- revisão read-only: sem regressão de rota, auth, props, SPA rewrite ou a11y
  estrutural.

## Limitações

- O chunk Dashboard ainda mede 589,26 kB e mantém o warning Vite >500 kB.
- Não foi feito um segundo split sem medir uma fronteira segura.
- O teste de falha de chunk é estático; uma simulação real de 404/MIME depende
  de browser autenticado/deploy.
- A release frontend-only foi publicada no Vercel oficial; não houve migration,
  alteração backend ou alteração no worker.

## Estado

```text
BUNDLE_INITIAL_REDUCTION=PASS
AUTH_ROUTE_CONTRACT=PASS
FRONTEND_REGRESSION=PASS
DASHBOARD_CHUNK_WARNING=ADVISORY
V1_POSTGRES_REAL_REHEARSAL=BLOCKED_ENVIRONMENT
PRODUCTION_FRONTEND_ONLY=PASS
```
