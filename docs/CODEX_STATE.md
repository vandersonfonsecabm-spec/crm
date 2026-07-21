# Estado atual do CRM

Data da verificacao: 18/07/2026.

## Estrutura ativa

- Frontend React, Vite e TypeScript em `frontend`.
- Backend Express, Prisma e SQLite em `backend`.
- Estruturas antigas da raiz `src` e `prisma` estao congeladas; nao remove-las
  nem utiliza-las sem auditoria especifica.

## Git

- Baseline oficial: `10fea4c80a065c63cb7b37acbc0369f37f73613a`.
- A master local divergente preserva o trabalho isolado de Estoque.
- Commit isolado de Estoque: `618a289`.
- Branch de arquivo: `archive/estoque-local-618a289`.
- Novas releases partem de `origin/master` ou da branch de release indicada.

## Producao oficial

- Frontend canonico: https://crm-murex-six-83.vercel.app.
- Backend: https://api-production-875f9.up.railway.app.
- Servico Railway: `crm-agro-api`; nao utilizar `crm-agro-demo-api`.
- Producao possui 17 migrations; health esperado HTTP 200.

## Banco local protegido

- Arquivo: `backend/prisma/dev.db`.
- Tamanho: 532.480 bytes.
- SHA-256: `cb62b4b2584162c9f66ff8e722319b96cf2697ebe9ea0a745a388d7ca572c26a`.
- Migrations locais: 9; quick check esperado `ok`; foreign key check esperado
  zero.
- Nunca escrever nesse banco durante testes.

## Reconciliacao read-only do banco de producao

- Em 2026-07-21, uma copia consistente do banco oficial foi inspecionada
  exclusivamente em `%TEMP%\crm-production-db-reconciliation`, sem consulta ou
  escrita direta no arquivo operacional.
- O arquivo principal tinha 770.048 bytes e SHA-256 fisico
  `13aa8b6a88784d48bc4592ff3a2bb33188dcbc51e4ee05af545b822ad206b510`;
  nao havia arquivos WAL ou SHM e o `journal_mode` observado foi `delete`.
- O fingerprint logico deterministico das tabelas comerciais foi
  `30f8f67a2fbce515ed57a8f2d6141adf010d6580eb2b666e9c200f1ef1b71e50`.
- As 17 migrations, schema, indices, contagens comerciais, `quick_check` e
  `foreign_key_check` permaneceram consistentes. A diferenca entre os SHAs
  fisicos historicos foi classificada como nao semantica; a unica variacao
  logica nao comercial foi o registro normal de ultimo login do usuario.
- Conclusao: BANCO LOGICAMENTE INTEGRO E SEM ALTERACAO COMERCIAL INESPERADA.

## Marcos concluidos

- Leads e canais, Inbox colaborativa e captacao de Lead pelo Site.
- Funcionalidades por tenant.
- Conversao de Lead para Negocio e Kanban baseado em Negocio.
- Vinculo legado controlado; novo Kanban ativo somente para empresa 1.

## Estado do Kanban

- Flags globais do novo Kanban ativas e capability ativa somente para
  `empresaId=1`.
- Tenant 1 utiliza um card baseado em Negocio.
- Kanban legado permanece disponivel para rollback e nao deve ser removido nesta
  fase.

## Caixa de Entrada operacional

- H1 implementada localmente na branch `feature/inbox-operations-mvp`, sem push
  ou deploy. A producao permanece com 17 migrations.
- Estados suportados: `NOVA`, `AGUARDANDO_ATENDIMENTO`, `EM_ATENDIMENTO`,
  `AGUARDANDO_CLIENTE`, `PENDENTE` e `ENCERRADA`.
- A fila compartilhada permite filtrar todas, nao atribuidas, conversas do
  usuario, estados e SLAs em atencao ou critico, sempre no tenant autenticado.
- Assumir, transferir, devolver a fila, aguardar cliente, marcar como pendente,
  encerrar e reabrir usam acoes explicitas, historico e concorrencia atomica.
- O lease existente de resposta foi preservado com duracao de dois minutos e
  relogio do servidor; ele nao altera o responsavel permanente.
- A migration aditiva local
  `20260721123000_add_inbox_operational_history` acrescenta somente acao,
  estado anterior e estado novo ao historico de atribuicao; nao foi aplicada ao
  banco local protegido nem a producao.
- O SLA e derivado da espera por atencao humana: ate 10 minutos dentro do prazo,
  acima de 10 em atencao, acima de 15 atrasado e acima de 30 critico.
- Mensagens inbound nao lidas sao contadas e marcadas como lidas apenas depois
  do carregamento bem-sucedido da conversa. Transferencia e retorno a fila nao
  apagam esse estado.
- ADMIN, GERENTE e VENDEDOR reutilizam as permissoes existentes de comunicacao;
  o backend impede acesso entre tenants e limita cada acao conforme autoria e
  responsabilidade.
- Testes focados de backend, migration, colaboracao, Site e frontend passaram,
  assim como lint, build, Prisma validate, verificacoes de sintaxe e QA visual
  em 1366x768, 1440x900, 1920x1080 e 900x768.
- Limitacoes: leitura continua sendo global por mensagem, nao por usuario; SLA
  e calculado, nao persistido; nao ha lease estrutural novo nem integracao
  externa nesta release. Nenhum `Negocio` e criado pelas acoes da Inbox.

## WhatsApp

- Nenhuma credencial Meta esta configurada e nenhuma chamada externa foi feita.
- Reutilizar `CanalIntegracao`, `ContatoCanal`, `ConversaCanal`,
  `MensagemCanal` e `EventoWebhook`; ampliar `CanalIntegracao`, sem estrutura
  paralela.
- Piloto manual com uma WABA e numero de teste para empresa 1; SaaS definitivo
  com Embedded Signup.
- Tenant mapping por WABA ID e Phone Number ID; nunca aceitar `empresaId` do
  payload.
- No piloto, segredos ficam na Railway e o banco guarda somente referencias.
- Capabilities planejadas: `WHATSAPP_INTEGRATION`, `WHATSAPP_INBOUND` e
  `WHATSAPP_OUTBOUND`.
- F1A-1P publicada no commit
  `f59c5f52784552936a20c7d99a6477ce38c67383`, com a migration
  `20260718184500_add_whatsapp_integration_foundation` aplicada em producao.
- Producao possui 16 migrations; a fundacao esta implantada, mas permanece
  operacionalmente desligada.
- Flags globais continuam `false` e nenhuma capability WhatsApp foi atribuida.
- O gate ADMIN `GET /integracoes/whatsapp/status` retorna `404` enquanto a
  fundacao permanece desligada.
- Nenhuma credencial Meta foi configurada, nenhuma chamada a Meta foi feita e o
  frontend nao foi alterado.
- F1A-2P publicada no commit
  `4fea3d532030a5de2914258eb7dd634813ec413a`; o callback GET e POST esta
  implantado em `/webhooks/whatsapp`.
- Producao continua com 16 migrations; flags e capabilities WhatsApp seguem
  desligadas, sem Verify Token ou App Secret configurados.
- O callback publico retorna `404`, nao processa nem persiste eventos e nenhuma
  chamada a Meta foi feita.
- O frontend nao recebeu deploy nesta release.
- F1B-0SP publicada no commit
  `8d68687e68a979f2d79e080c04b21fb16eb025e9`; producao possui 17
  migrations, incluindo
  `20260718205500_add_event_webhook_atomic_payload`.
- `EventoWebhook.payloadJson` esta disponivel como campo opcional; eventos
  legados permanecem com `payloadJson` nulo e o fluxo Site continua compativel.
- Na F1B-0SP, o callback WhatsApp ainda nao utilizava `payloadJson` nem aceitava
  eventos operacionalmente; GET e POST publicos retornavam `404`.
- Flags e capabilities permanecem desligadas, sem Verify Token, App Secret,
  credencial Meta ou chamada a Meta.
- O frontend nao recebeu deploy nesta release.
- F1B-1P publicada no commit
  `10fea4c80a065c63cb7b37acbc0369f37f73613a`; producao continua com 17
  migrations e a aceitacao duravel esta implantada.
- `EventoWebhook.payloadJson` e `payloadHash` armazenam o evento atomico, com
  idempotencia baseada no wamid e HTTP 200 somente apos persistencia confirmada
  ou retry materialmente equivalente.
- O callback GET e POST continua retornando `404` pelos gates desligados;
  nenhuma mensagem WhatsApp foi persistida em producao e nenhuma entidade
  comercial foi criada.
- Flags e capabilities continuam desligadas, sem Verify Token, App Secret,
  credencial Meta ou chamada a Meta; o frontend nao recebeu deploy.
- F1B-2P publicada no commit
  `517fdd7f51c4f310b9a601cae1431af6512fabaf`; producao continua com 17
  migrations e o processador interno esta implantado.
- O processador permanece sem acionamento automatico: o callback, as rotas, o
  startup e qualquer job nao o chamam.
- Nenhum `EventoWebhook` foi processado em producao e nenhum Cliente, Lead,
  `ContatoCanal`, `ConversaCanal` ou `MensagemCanal` foi criado.
- O callback GET e POST continua retornando `404`; flags e capabilities
  permanecem desligadas, sem Verify Token, App Secret, credencial Meta ou
  chamada a Meta, e o frontend nao recebeu deploy.
- Baseline oficial: `551dee5c785ddb1579214ce7bbb3bf459cfcf5c0`.
- F1B-3P publicada; a producao continua com 17 migrations.
- A orquestracao completa esta implantada: o callback conecta o intake duravel
  ao processador somente depois do commit do `EventoWebhook`.
- HTTP 200 depende do processamento completo ou de retry equivalente.
- O callback continua retornando HTTP 404 porque flags e capabilities estao
  desligadas e Verify Token e App Secret permanecem ausentes.
- Nenhum `EventoWebhook` WhatsApp ou entidade comercial foi criado em producao;
  nenhuma chamada Meta ou resposta outbound ocorreu.
- O frontend permaneceu sem deploy.
- Baseline oficial do repositorio e do frontend:
  `40c9465b9cbbd38865eb76d805d8cc3a4b21907c`.
- F1UI-1P publicada com o painel administrativo nas rotas `/integracoes` e
  `/integracoes/whatsapp`, reutilizando a area Integracoes e o acesso ADMIN.
- O painel suporta os estados `NOT_CONFIGURED`, `WAITING_META_AUTH`,
  `CONFIGURED_INACTIVE`, `CONNECTED`, `PAUSED`, `ERROR` e `UNAVAILABLE`.
- O estado real permanece `NOT_CONFIGURED`; o endpoint de status continua
  retornando `404` para ADMIN enquanto os gates estiverem desligados.
- `Conectar WhatsApp` abre somente o modal informativo e `Continuar na Meta`
  permanece desabilitado; nenhuma autenticacao Meta foi iniciada.
- A URL publica do webhook pode ser copiada. Nenhuma credencial e solicitada,
  exibida ou armazenada, e as acoes operacionais permanecem desabilitadas.
- O backend funcional ativo permanece no commit
  `551dee5c785ddb1579214ce7bbb3bf459cfcf5c0`; o Railway ignorou o push por nao
  haver diff em `backend`, e a producao permanece com 17 migrations.
- Flags, capabilities e segredos permanecem ausentes; nenhuma mensagem real ou
  chamada Meta ocorreu. Outbound nao esta implementado.
- WhatsApp formalmente pausado aguardando autenticacao manual da Meta.
- Proxima release: F1C-1, ativacao controlada do piloto Meta quando houver
  autenticacao manual disponivel.
