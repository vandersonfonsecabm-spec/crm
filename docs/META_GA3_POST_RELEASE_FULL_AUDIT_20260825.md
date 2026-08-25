# GA3 — auditoria pós-release completa

Data: 25/08/2026
Frontend runtime: `ebdf118`
API hardening runtime: `57e90e4`
Escopo: produção Vercel/Railway, staging sintético, rotas autenticadas,
contratos de navegação, segurança de sessão/origem, exportação CSV, mobile e
regressão frontend.

## Resultado

```text
POST_RELEASE_AUDIT=PASS_WITH_FIXES
ROUTES_AND_DESTINATIONS=PASS
API_RESPONSES_OBSERVED=ALL_2XX
CONSOLE_ERRORS=0
HORIZONTAL_OVERFLOW_DESKTOP=0
STAGING_AUTHENTICATED_QA=PASS
PRODUCTION_DATA_MUTATION_DURING_AUDIT=0
V1_PROPOSALS=UNTOUCHED
```

## Falhas encontradas e corrigidas

### Alias oficial secundário sem sessão/API

`crm-vand-s-projects.vercel.app` era um alias oficial ativo, mas o frontend
reconhecia somente `crm-murex-six-83.vercel.app`. O backend também tinha apenas
o alias principal no CORS configurado.

Correção:

- allowlist frontend com os dois aliases oficiais;
- `ALLOWED_ORIGINS` da API com os dois aliases;
- teste de resolver adicionado;
- CORS secundário confirmado `204`;
- origem maliciosa confirmada `403`;
- alias secundário agora abre o login normalmente, sem tela de erro.

### Exportação CSV insegura

O exportador apenas envolvia valores com aspas e não duplicava aspas internas
nem neutralizava células iniciadas por `=`, `+`, `-` ou `@`.

Correção:

- `toCsvCell` escapa aspas;
- prefixa fórmulas potenciais com apóstrofo;
- teste de hardening adicionado;
- sem alteração de payload ou regra comercial.

### Destino de API configurado de forma insegura

Preview aceitava origem HTTP ou URL com caminho arbitrário em `VITE_API_URL`.

Correção:

- Preview aceita somente `/api` ou origem HTTPS sem credenciais, query ou path;
- HTTP, path arbitrário e origem oficial direta continuam fail-closed;
- matriz de testes adicionada.

### HSTS ausente na API

A Vercel já emitia HSTS, mas o host Railway não.

Correção:

- API em produção agora envia
  `Strict-Transport-Security: max-age=31536000; includeSubDomains`;
- `nosniff`, X-Frame-Options, CSP, Referrer-Policy e Permissions-Policy
  permaneceram ativos.

## Verificações executadas

- Produção autenticada: Visão Geral, Painel Comercial, Caixa de Entrada,
  Leads, Clientes, Negócios, Agenda, Estoque, Integrações, Usuários, Tenants,
  Catálogo e Configurações de IA.
- Links “Abrir Painel Comercial”, “Abrir Agenda” e “Abrir conversas aguardando
  resposta” chegaram às rotas corretas.
- Cliente 360 abriu dados, timeline, origem e estados sem executar mutação.
- Requests observados nas rotas auditadas retornaram `200`.
- Console do navegador: zero erros/warnings.
- Staging: login, refresh, logout/login, rotas diretas, mobile 390x844 e CORS.
- Produção: `/`, rota direta `/negocios`, `/api/health` e `/api/ready` `200`.
- API: alias oficial `204`, origem maliciosa `403`, HSTS presente.
- Frontend: `199/199` testes, autenticação `19/19`, build, TypeScript, lint e
  `git diff --check` PASS.

## Limitações honestas

- Não foram executadas ações de criação/edição/exclusão em dados reais.
- QA autenticado de mutação em produção não foi necessário; mutações foram
  cobertas no staging sintético e nos testes de contrato.
- axe automatizado, carga PostgreSQL real e `pg_stat_statements` continuam
  gates separados.
- O chunk assíncrono do Dashboard permanece acima de 500 kB como advisory;
  segundo split exige nova medição.

## Estado final

```text
FRONTEND_SECURITY=HARDENED
API_SECURITY=HARDENED
DATA_AND_NAVIGATION_AUDIT=PASS
STAGING_DATA=SYNTHETIC_ONLY
STAGING_EXTERNAL_OUTBOUND=DENY_BY_DEFAULT
PRODUCTION_BACKEND_DATA=UNCHANGED
```
