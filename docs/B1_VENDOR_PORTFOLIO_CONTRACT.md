# B1 — contrato de portfólio do VENDEDOR

`CURRENT_STATE_AS_OF=2026-08-23`

## Decisão

Dentro de uma empresa (`empresaId`), o papel `VENDEDOR` possui visibilidade de
leitura da fila comercial tenant-scoped. Isso permite que o vendedor encontre
pendências e assuma um item disponível. A visibilidade não é uma autorização
global: todas as consultas continuam limitadas à empresa do contexto autenticado.

O portfólio de escrita do vendedor é restrito ao próprio escopo operacional:

- pode ler leads e conversas da própria empresa;
- pode atualizar o lead/conversa que lhe foi atribuído;
- pode assumir item disponível pela fila, quando o endpoint permite essa ação;
- pode tratar mensagens, notas e estado dentro das permissões de vendedor;
- não pode atribuir ou transferir para outro usuário;
- não pode acessar, alterar ou inferir dados de outra empresa;
- não pode elevar o próprio papel nem escolher `empresaId` por payload.

`ADMIN` e `GERENTE` mantêm as operações de gestão e redistribuição dentro da
própria empresa. Nenhum papel recebe autorização cross-tenant.

## Evidência executada

O teste focal `backend/tests/leads-communication-services-b1.test.js` foi
executado no sandbox Prisma isolado em 2026-08-23 e passou. Ele comprova:

- vendedor vê a fila tenant-wide, mas não vê o lead de outra empresa;
- leitura por ID de outro tenant retorna 404;
- vendedor atualiza o próprio lead/conversa e não consegue atribuir;
- administração/gerência consegue redistribuir somente dentro do tenant;
- isolamento de mensagens, conversas, contatos e external IDs permanece por
  `empresaId`;
- concorrência de assumir/transferir converge sem duplicar auditoria.

## Resultado

`B1_PRODUCT_CONTRACT=DEFINED`

`B1=PASS`

Esta decisão substitui a classificação histórica de “baseline conhecido”; uma
alteração futura do portfólio deve atualizar este contrato e seus testes antes
de alterar a autorização.
