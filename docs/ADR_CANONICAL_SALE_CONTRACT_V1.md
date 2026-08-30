# ADR — Contrato de Venda Canônica V1

Status: FROZEN para implementação local

Data: 2026-08-28

## 1. Autoridades de domínio

- `Negocio` continua sendo o eixo da negociação.
- `PropostaComercial` representa preço e condições oferecidas.
- Proposta aceita não cria receita e não fecha o Negócio automaticamente.
- `VendaCanonica` ativa é a única fonte de receita realizada.
- `Cliente.valor` e `Negocio.valor` são legados/estimativas e nunca são fonte
  de receita realizada.
- Catálogo atual nunca recalcula proposta ou venda histórica.

## 2. Mapeamento de estados do Negócio

```text
OPEN = NOVO | CONTATO | PROPOSTA
WON  = FECHADO
LOST = PERDIDO
```

Transições:

- OPEN -> OPEN: permitida pelo comando normal de etapa, com CAS.
- OPEN -> WON: somente `closeDealAsWon`.
- OPEN -> LOST: somente `markDealAsLost`, com motivo obrigatório.
- WON/LOST -> OPEN: somente `reopenDeal`, por ADMIN/GERENTE e com motivo.
- WON/LOST não mudam pelo PATCH genérico de Kanban.
- Reabrir WON invalida a venda ativa e restaura a etapa aberta anterior
  persistida no snapshot.
- Reabrir LOST restaura a última etapa aberta registrada no histórico.

## 3. Proposta principal

- Um Negócio possui zero ou uma proposta principal.
- A proposta principal precisa pertencer ao mesmo tenant, Cliente e Negócio.
- Estados elegíveis: `RASCUNHO`, `PRONTA`, `ENVIADA` e `ACEITA`.
- Definir, trocar ou remover principal é ação explícita com CAS.
- Aceitar uma proposta também a torna principal.
- Ao entrar em estado terminal não elegível, o ponteiro principal é limpo na
  mesma transação.

## 4. Proposta vencedora

- Um Negócio possui zero ou uma proposta vencedora ativa.
- Aceitar a primeira proposta é operação dedicada e transacional: muda a
  proposta para `ACEITA` e grava os ponteiros principal/vencedora.
- O endpoint genérico de status não aceita transição para `ACEITA`.
- Se já existe vencedora, aceitar outra retorna conflito.
- Substituir vencedora exige ação explícita e motivo: a anterior vira
  `SUBSTITUIDA`, a nova vira `ACEITA` e ambos os históricos são registrados.
- `SUBSTITUIDA` é terminal e nunca pode gerar receita.
- Dados legados com proposta `ACEITA` e sem ponteiro não são reinterpretados.
  ADMIN/GERENTE podem executar reconciliação explícita, escolhendo uma e
  marcando as demais aceitas do mesmo Negócio como `SUBSTITUIDA`.
- Nenhuma troca de vencedora é permitida enquanto o Negócio estiver WON.

## 5. Contrato estrutural por Negócio

Uma tabela aditiva `NegocioContratoVenda` possui exatamente uma linha por
Negócio quando o novo contrato é usado:

```text
empresaId
negocioId
propostaPrincipalId?
propostaVencedoraId?
vendaAtivaId?
revisao
createdAt
updatedAt
```

FKs compostas incluem tenant e Negócio. A revisão é a autoridade CAS para
primary, winner, close, lost e reopen. Ausência da linha equivale a revisão 1
com ponteiros nulos; a primeira escrita cria a linha de modo idempotente.

## 6. Venda Canônica

Fontes:

```text
ACCEPTED_PROPOSAL
MANUAL_CLOSE
```

Regras comuns:

- tenant, Negócio, Cliente, ator, BRL, centavos, totais, revisão, origem,
  idempotência e snapshot de cabeçalho são obrigatórios;
- status: `ACTIVE` ou `INVALIDATED`;
- existe no máximo uma venda `ACTIVE` por Negócio;
- revisão é monotônica por Negócio;
- snapshot monetário é imutável;
- invalidação altera apenas metadados de ciclo de vida e grava histórico;
- nenhuma venda é apagada.

`ACCEPTED_PROPOSAL`:

- exige a proposta vencedora `ACEITA` do mesmo tenant/Negócio/Cliente;
- subtotal, desconto, total, revisão e todos os itens são copiados;
- catálogo, oferta e estoque atuais não participam de leituras históricas.

`MANUAL_CLOSE`:

- é permitido somente quando não existe proposta vencedora;
- exige `valorFinalCentavos` explícito, inclusive zero;
- usa subtotal=total e desconto=0;
- zero itens é válido no V1; o snapshot de cabeçalho registra a venda sem
  documento formal.

## 7. Item de venda

Para venda por proposta, cada item copia:

- IDs de origem opcionais;
- descrição, SKU e unidade em snapshot;
- quantidade com até três casas;
- preço unitário, desconto, subtotal e total em centavos;
- moeda BRL e revisão de catálogo quando conhecida.

Nenhum campo monetário do snapshot pode ser nulo. Zero e desconhecido nunca
são equivalentes.

## 8. Idempotência e concorrência

- A chave é única por tenant.
- O servidor persiste fingerprint normalizado de Negócio, fonte, vencedora,
  revisão e valor manual.
- Mesma chave + mesmo fingerprint retorna a mesma venda.
- Mesma chave + fingerprint diferente retorna conflito.
- Chaves diferentes concorrendo para o mesmo Negócio convergem para uma venda
  ou conflito controlado.
- Venda, itens, histórico, ponteiro ativo e etapa WON são gravados na mesma
  transação.
- Constraints únicas cobrem idempotência, revisão de venda e uma venda ativa.

## 9. Reabertura e correção

- Somente ADMIN/GERENTE.
- Motivo e revisão esperada são obrigatórios.
- A venda ativa muda para `INVALIDATED`, com ator/data/motivo e histórico.
- O snapshot antigo permanece intacto e é excluído de receita realizada.
- O ponteiro de venda ativa é limpo e a etapa aberta anterior é restaurada.
- A proposta vencedora pode permanecer selecionada; trocar ou removê-la exige
  ação explícita.
- Novo fechamento cria nova revisão de venda; nunca reutiliza a anterior.

## 10. Fechamento como perdido

- Exige motivo e CAS.
- Não cria venda.
- É bloqueado se existir venda ativa ou proposta vencedora.
- Para desistir após aceite, a vencedora precisa ser removida/superseded por
  ação explícita e auditada antes do LOST.

## 11. RBAC

- Leitura comercial: papéis atuais, sempre no tenant autenticado.
- VENDEDOR responsável ou ADMIN/GERENTE: definir principal, aceitar proposta e
  fechar o Negócio.
- Apenas ADMIN/GERENTE: substituir/reconciliar/remover vencedora, reabrir ou
  invalidar venda.
- IDs do payload nunca definem tenant.
- Cliente arquivado e relações cross-tenant falham fechado.

## 12. Dinheiro e legado

```text
CANONICAL_MONEY_UNIT=CENTS
CANONICAL_CURRENCY_V1=BRL
NULL_DISTINCT_FROM_ZERO=true
```

- Novas vendas usam `Int` em centavos e os limites do hardening `79eed4f`.
- `Cliente.valor` permanece legado/manual, sem backfill e fora da receita.
- `Negocio.valor` permanece estimativa legada; `null` é desconhecido e zero é
  estimativa conhecida igual a zero.
- Pipeline pode continuar usando a estimativa do Negócio, com rótulo honesto.
- Receita, total vendido, última venda e compras vêm somente de vendas ativas.

## 13. Customer 360, dashboard, relatórios e exportação

- `totalVendidoCentavos` = soma de `VendaCanonica.totalCentavos` ACTIVE.
- Compras anteriores listam vendas ativas, não Negócios FECHADO isolados.
- Pipeline e receita são métricas distintas.
- Proposta aceita, Cliente.valor e Negocio.valor nunca entram em receita.
- API, UI e CSV exibem BRL, fonte, status, fechamento, proposta e revisão.
- Zero é exibido como valor; `null` é exibido como não informado.

## 14. UI

O drawer do Negócio mostra, sem depender apenas de cor:

- valor estimado;
- proposta principal;
- proposta vencedora;
- estado Aberto/Ganho/Perdido;
- venda realizada, origem, valor e data;
- histórico de venda e invalidação.

Arrastar para Ganho ou Perdido abre o comando explícito correspondente; nunca
executa o PATCH terminal silenciosamente.

## 15. Migration e compatibilidade

- Migration local estritamente aditiva: tabelas, índices, constraints e enum
  adicional; nenhum DROP, rename, backfill ou reinterpretação.
- O schema aditivo não quebra consultas do runtime anterior, mas o startup de
  um artefato que não carregue a migration atual pode recusar um banco que já a
  registrou. Rollback operacional exige artefato-ponte migration-aware ou
  pausa de escrita com forward-fix; nunca presumir que basta redeployar um SHA
  anterior.
- Depois da primeira Venda V1, rollback permanece forward-fix ou pausa de
  escrita; nunca remover tabelas com dados.
- Ensaio obrigatório: migrate-empty, upgrade histórico, repetição idempotente,
  SQLite, PostgreSQL causal, integridade e `dev.db` imutável.

## 16. Gates congelados

```text
CANONICAL_SALE_CONTRACT_V1=FROZEN
AMBIGUOUS_COMMERCIAL_RULES=0
PROPOSAL_ACCEPTED_DOES_NOT_AUTO_CLOSE_DEAL=true
ONE_PRIMARY_PROPOSAL=true
ONE_ACTIVE_WINNING_PROPOSAL=true
SALE_WITH_ACCEPTED_PROPOSAL=true
SALE_WITHOUT_PROPOSAL=true
SALE_CREATED_ON_DEAL_WON=true
SALE_SNAPSHOT_MUTABLE=false
CANONICAL_SALE_IS_REVENUE_SOURCE=true
```
