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
- F1B-3 implementada localmente; a producao oficial permanece no commit
  `517fdd7f51c4f310b9a601cae1431af6512fabaf`, com 17 migrations.
- O callback local chama o intake duravel e, somente depois do commit do
  `EventoWebhook`, executa o processador interno.
- HTTP 200 ocorre somente apos processamento completo ou retry equivalente;
  falha de processamento retorna HTTP 503 e preserva o evento para retomada.
- Nenhum worker ou fila foi criado; flags e capabilities continuam desligadas,
  sem credencial, chamada a Meta ou resposta outbound.
- Proxima release: F1B-3P, publicacao da orquestracao ainda desligada.
