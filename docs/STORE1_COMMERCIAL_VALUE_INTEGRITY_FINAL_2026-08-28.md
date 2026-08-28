# STORE-1 — auditoria final de integridade de valores comerciais

Data: 2026-08-28
Branch: `codex/store1-release-reconcile`
Baseline funcional: `db59f37ee69c0ed2b4cb3c75b871dfb1ed5a0162`
Commit de hardening: `79eed4f`
Reviewer adversarial final: `RETHINK`

## Resultado executivo

```text
COMMERCIAL_VALUE_HARDENING_LOCAL=PASS
STORE1_COMMERCIAL_VALUE_INTEGRITY_END_TO_END=NOT_PROVABLE
FINAL_ADVERSARIAL_VERDICT=RETHINK
POSTGRES_CAUSAL_GATE=BLOCKED_LOCAL_DOCKER
PRODUCTION_CHANGED=NO
REAL_PROVIDER_CONNECTED=NO
REAL_OUTBOUND=NO
MIGRATION_CREATED_OR_APPLIED=NO
```

As falhas determinísticas de precisão, limite, snapshot e apresentação encontradas nesta auditoria foram corrigidas e validadas localmente. O objetivo maior, porém, não pode receber PASS: o modelo atual não define uma venda fechada canônica que una uma proposta aceita, um negócio fechado e o valor do cliente.

## 1. Estado inicial

- A execução ocorreu somente na worktree isolada `C:\Users\vande\AppData\Local\Temp\crm-store1-release-reconcile-20260827`.
- A worktree principal divergente não foi alterada.
- A baseline funcional `db59f37...` é ancestral do candidato.
- `backend/prisma/dev.db` permaneceu imutável com SHA-256 `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533`.
- Produção, staging, cloud, providers reais, credenciais e outbound permaneceram intocados.

## 2. Auditoria e correção do comando

O comando recebido estava truncado após `Cliente.valor,` e pressupunha implicitamente que todos os valores deveriam ser iguais. A execução foi corrigida sem mudar o objetivo:

- `Cliente.valor`, `Negocio.valor` e `PropostaComercial.totalCentavos` foram primeiro classificados por semântica e unidade;
- igualdade automática entre essas fontes não foi inventada;
- mudanças que exigiriam nova regra de fechamento, vínculo canônico, migration ou escolha de moeda foram registradas como decisão de produto/schema;
- somente código local, fixtures e bancos descartáveis foram autorizados;
- nenhuma conta real, provider, OAuth, credencial, outbound, módulo financeiro ou produção entrou no escopo.

## 3. Implementação

### Precisão e limites

- Parser monetário compartilhado passou a usar texto e `BigInt`, com `ROUND_HALF_UP` e teto comum de `2.147.483.647`, correspondente ao `INTEGER` do PostgreSQL.
- Booleanos, arrays, whitespace, frações indevidas, notação científica e overflow deixaram de ser coercidos para valores válidos.
- Propostas, catálogo, importação manual, Bling, produtos, qualificação, conversão e `Cliente.valor` passaram a respeitar o mesmo limite.
- O importador agora valida o agrupamento dos separadores antes de removê-los; entradas como `1,2` no modo decimal por ponto e `1.2` no modo decimal por vírgula são rejeitadas.

### Proposta, catálogo e snapshots

- Preview do frontend replica a aritmética do backend em milésimos inteiros; `1.005 × 100 centavos` resulta em `101` centavos nos dois lados.
- Edição de rascunho preserva `CATALOG_ITEM` e `productOfferId`; descrição, preço e desconto server-owned permanecem bloqueados.
- Itens catalogados exibem origem, SKU, revisão e estado de preço.
- `ProductOffer` expõe `priceStatus` e revalida preço, moeda e status mesmo se a revisão do catálogo não tiver mudado.
- Arquivamento do catálogo grava `archivedAt`; republicação limpa o timestamp.
- Duplicação de versão relê a proposta dentro da transação, depois do lock, evitando copiar snapshot lido antes da operação concorrente.
- Relações proposta/negócio/lead do mesmo tenant agora também precisam pertencer ao mesmo contexto comercial.

### Integridade persistida

- Antes de listar, abrir, alterar status, duplicar ou gerar PDF, o servidor recalcula cada subtotal e total persistido.
- Corrupção deliberada de subtotal, desconto ou total retorna `PROPOSAL_MONEY_INTEGRITY_CONFLICT`; o sistema não exibe nem promove silenciosamente o valor adulterado.
- Nenhum CHECK/trigger novo foi criado porque isso exigiria migration e ensaio PostgreSQL causal.

### Cliente, Negócio, Customer 360 e relatórios

- Mudança de `Cliente.valor` exige revisão/CAS e validação inteira estrita.
- Zero explícito em conversão de Lead permanece zero; ausência permanece `null` no Negócio.
- Customer 360 preserva `Negocio.valor = null` e exibe `Não informado`, sem convertê-lo em venda de R$ 0,00.
- Timeline mostra duas casas decimais.
- CSV distingue valor desconhecido de zero informado e identifica BRL.
- Indicadores baseados em `Cliente.valor/status` receberam rótulos honestos; métricas calculadas somente sobre a página são declaradas como locais.
- Cards de catálogo/oferta mostram preço somente com status explicitamente `AVAILABLE`.
- Preço promocional só é escolhido dentro da vigência conhecida.
- A sincronização manual futura do Bling inclui `PRECOS`, sem conectar ou chamar provider real nesta missão.

## 4. Arquivos alterados

Principais grupos no commit `79eed4f`:

- Backend monetário e proposta: `backend/src/shared/commercial-money.js`, `backend/src/commercial-proposals/service.js`.
- Catálogo/oferta: `backend/src/ai-commerce/catalog.js`, `common.js`, `offer.js`.
- Clientes/Negócios/Customer 360: `backend/src/server.js`, `backend/src/customer-360/service.js`, `backend/src/leads-communication/*`.
- Importação/Bling: `backend/src/integrations/importService.js`, `blingService.js`.
- Frontend monetário e proposta: `frontend/src/utils/commercialMoney.*`, `CommercialProposalsPanel.tsx`.
- Exibições e relatórios: componentes de Dashboard, Customer 360, Leads, catálogo e hooks de analytics/exportação.
- Testes: novos contratos monetários backend/frontend e ampliação das suítes H2/H3/H5, G1, catálogo, escopo comercial e Bling.
- Fixture visual local: `frontend/tests/fixtures/commercial-money-integrity.*`.

O commit contém 46 arquivos, 774 inserções e 135 remoções. Não há dependência nova.

## 5. Migration e banco

- Migration criada: não.
- Migration aplicada: não.
- Banco oficial/staging acessado ou alterado: não.
- SQLite: apenas cópias descartáveis criadas pelo runner isolado, com cleanup confirmado.
- PostgreSQL atual: a suíte focada não iniciou porque o daemon Docker local não subiu. O aplicativo Docker iniciado para a tentativa foi encerrado e os processos auxiliares foram limpos.
- O PASS histórico PostgreSQL V72 antecede este diff e não foi usado como prova causal.

Antes de qualquer promoção, o candidato precisa passar em PostgreSQL descartável com limites, fórmulas, CAS e concorrência update-versus-duplicate.

## 6. Testes e verificações

### Backend

- Focal combinado: 26/26 PASS.
- Parser/importador após finding adversarial: 5/5 PASS.
- Propostas H3 isolado: 1/1 PASS, incluindo corrupção deliberada e contexto same-tenant divergente.
- Customer 360 H5: 1/1 PASS.
- Conversão Lead → Negócio G1: 1/1 PASS.
- Qualificação Inbox H2: 1/1 PASS.
- Escopo comercial: 2/2 PASS.
- Importação manual: 1/1 PASS após a correção de agrupamento.
- Bling simulado: 16/16 PASS.

### Frontend

- Suíte completa: 225/225 PASS.
- Teste monetário final/fixture: 8/8 PASS.
- TypeScript + Vite build: PASS.
- ESLint: PASS.

### QA visual

- 1366×768: PASS.
- 1440×900: PASS.
- 1920×1080: PASS.
- 900×768 básico: PASS.
- Sem overflow horizontal, overlay Vite ou erros/warnings de console.
- Total visual confirmado: `R$ 2.525,01` no subtotal e total.

## 7. Commit, push e deploy

- Commit funcional local: `79eed4f` (`fix-commercial-value-integrity`).
- Push: não executado; não autorizado.
- Deploy: não executado; não autorizado.
- Produção/cloud: nenhuma alteração.

## 8. Estado final e limitações

### Hardening aprovado localmente

Os fluxos existentes agora são mais estritos e honestos quanto a precisão, limites, snapshots, corrupção persistida, `null` versus zero e apresentação.

### Bloqueadores para PASS ponta a ponta

1. Não há `acceptedProposalId`, snapshot de fechamento ou outra fonte canônica que determine qual proposta virou venda.
2. Proposta `ACEITA` e Negócio `FECHADO` são transições independentes.
3. Não há unicidade de proposta aceita por Negócio nem idempotência persistente na criação.
4. `Cliente.valor` e `Negocio.valor` usam inteiro em reais; proposta usa centavos. `Cliente.valor` também usa zero como default, portanto ausência e zero não são distinguíveis sem mudança de modelo/proveniência.
5. A política para aceitar proposta em negócio terminal e para substituir uma proposta já aceita não está definida.
6. O catálogo aceita moedas que a Proposta V1 não aceita; restringir a BRL ou suportar multi-moeda exige decisão explícita.
7. O gate PostgreSQL causal atual permanece pendente.
8. Uma tela de inventário aberta não agenda revalidação exatamente no início/fim da promoção; hoje depende de nova renderização ou dado efetivo do servidor.

Por essas razões, não definir `STORE1_COMMERCIAL_VALUE_INTEGRITY=PASS` neste candidato.

## 9. Próximo passo mínimo seguro

Realizar uma decisão curta de produto/schema antes de nova implementação:

1. escolher a fonte de verdade da venda fechada;
2. escolher a unidade monetária canônica;
3. definir proposta vencedora, idempotência e política de fechamento/substituição;
4. decidir como distinguir zero de valor não informado em Cliente;
5. somente então criar migration aditiva, ensaiá-la em PostgreSQL descartável e executar os testes concorrentes exigidos.

Até essa decisão, o commit `79eed4f` deve permanecer como candidato local de hardening, sem push/deploy.

## Otimizações de execução

- O soak STORE-1, auditorias aprovadas e evidências de produção não foram repetidos.
- A worktree principal divergente e o banco oficial permaneceram intocados.
- Após cada falha, somente o gate causal foi repetido.
- O PostgreSQL não foi redirecionado para staging quando o Docker local falhou.
