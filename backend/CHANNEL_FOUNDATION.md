# Fundacao multiempresa de canais

Esta etapa cria apenas a base local para canais de atendimento por empresa. Nao ha webhook, Meta API, envio, recebimento, IA, WhatsApp real, credenciais, tokens ou alteracao automatica de Cliente, Nota, Acompanhamento ou Funil.

## Auditoria multiempresa

| Model | empresaId | Relacao Empresa | Leituras filtram por empresa | Escritas usam empresa autenticada | Unicidade | Risco | Correcao futura |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Empresa | N/A | N/A | N/A | N/A | slug global | Baixo | Nenhuma nesta etapa |
| Usuario | Sim | Sim | Sim | Sim | email por empresa | Baixo | Manter isolamento |
| Cliente | Nao | Nao | Nao | Nao | global | Alto | Adicionar empresaId antes de registro automatico |
| Nota | Nao | Indireta por Cliente, mas Cliente nao tem empresa | Nao | Nao | global | Alto | Migrar junto com Cliente |
| Acompanhamento | Nao | Nao | Nao | Nao | global | Alto | Adicionar empresaId antes de automacao |
| Produto | Nao | Nao | Nao | Nao | codigo global opcional | Alto | Separar estoque interno por empresa em fase futura |
| CategoriaProduto | Nao | Nao | Nao | Nao | nome global | Alto | Separar categorias por empresa em fase futura |
| MovimentacaoEstoque | Nao | Nao | Nao | Nao | global | Alto | Migrar junto com Produto |
| Integracao | Sim | Sim | Sim | Sim | escopo por empresa em rotas | Baixo | Preservar para ERP/catalogo |
| ProdutoExterno | Sim | Sim | Sim | Sim | integracaoId + externalId | Baixo | Preservar Hub |
| ImportacaoDados | Sim | Sim | Sim | Sim | hash apenas consultivo | Medio | Regras de reprocessamento por empresa |
| CanalIntegracao | Sim | Sim | Sim | Sim | empresaId + chaveInterna | Baixo | Base para WhatsApp futuro |
| ContatoCanal | Sim | Sim | Sim no servico | Sim | canalIntegracaoId + externalId | Baixo | Vincular a Cliente somente depois da migration multiempresa |
| ConversaCanal | Sim | Sim | Sim no servico | Sim | chaveAberta unica | Baixo | Adicionar atendente e SLA em fase futura |
| MensagemCanal | Sim | Sim | Sim no servico | Sim | canalIntegracaoId + externalId | Baixo | Adicionar payload sanitizado se necessario |

REGISTRO AUTOMATICO DO WHATSAPP NO CRM BLOQUEADO ATE A MIGRATION MULTIEMPRESA.

## Decisao: CanalIntegracao separado

O model Integracao atual e orientado a ERP, importacao, sincronizacao de catalogo, produtos externos, estoque externo e precos. Canais de atendimento possuem ciclo de vida diferente: conversas, contatos externos e mensagens. Por clareza de auditoria e para evitar acoplamento entre ERP e atendimento, esta fundacao cria `CanalIntegracao` separado.

## Models criados

- `CanalIntegracao`: canal administrativo por empresa.
- `ContatoCanal`: identidade externa dentro de um canal.
- `ConversaCanal`: conversa aberta ou encerrada.
- `MensagemCanal`: mensagem simulada e idempotente por canal.

Enums:

- `TipoCanal`: `WHATSAPP_META`
- `StatusCanal`: `MODO_TESTE`, `INATIVO`
- `DirecaoMensagem`: `ENTRADA`, `SAIDA`
- `StatusConversa`: `ABERTA`, `ENCERRADA`
- `StatusMensagem`: `RECEBIDA`, `PROCESSADA`, `PREPARADA`, `ERRO`
- `TipoMensagemCanal`: `TEXTO`, `DESCONHECIDA`

## Constraints e isolamento

- `CanalIntegracao`: unique `empresaId + chaveInterna`.
- `ContatoCanal`: unique `canalIntegracaoId + externalId`.
- `ConversaCanal`: `chaveAberta` unica enquanto a conversa esta aberta.
- `MensagemCanal`: unique `canalIntegracaoId + externalId`.

SQLite e Prisma nao foram forçados a usar relacoes compostas complexas entre empresa e todos os filhos. Por isso cada model tem `empresaId`, e o servico valida canal, contato, conversa e mensagem dentro do tenant antes de escrever.

## Canal de teste

`POST /canais/whatsapp/teste` cria ou reutiliza um canal:

- `tipo`: `WHATSAPP_META`
- `chaveInterna`: `whatsapp-meta-test`
- `nome`: `WhatsApp - Modo de Teste`
- `status`: `MODO_TESTE`
- `modoTeste`: `true`
- `ativo`: `true`

Nao ha telefone, credenciais, tokens, webhook ou chamada externa.

## Rotas

Todas exigem ADMIN real:

- `GET /canais`
- `GET /canais/:id`
- `GET /canais/:id/status`
- `POST /canais/whatsapp/teste`
- `PATCH /canais/:id`

GERENTE, VENDEDOR, sem token e token invalido sao bloqueados pelo middleware existente.

## Allowlist

As respostas de canal retornam somente:

- `id`
- `nome`
- `tipo`
- `status`
- `modoTeste`
- `ativo`
- `createdAt`
- `updatedAt`

Nao retornam `empresaId`, `chaveInterna` ou campos internos.

## PATCH

Campos aceitos:

- `nome`
- `ativo`

Campos extras sao rejeitados. `ativo: false` muda o status para `INATIVO`. `ativo: true` em canal de teste retorna o status para `MODO_TESTE`.

## Normalizacao de telefone

`normalizePhone(value, options)`:

- remove separadores visuais;
- aceita `+` apenas no inicio;
- exige digitos apos normalizacao;
- nao presume pais sem `defaultCountryCode`;
- respeita limite E.164 de 15 digitos;
- rejeita vazio, curto ou longo demais.

Usar apenas numeros sinteticos nos testes.

## Limites

- Nome do canal: 120 caracteres.
- External ID: 160 caracteres.
- Nome de contato: 160 caracteres.
- Texto de mensagem: 4000 caracteres.

Valores acima do limite sao rejeitados; nao ha truncamento silencioso.

## Idempotencia e concorrencia

- Canal de teste: `empresaId + chaveInterna`.
- Contato: `canalIntegracaoId + externalId`.
- Conversa aberta: `chaveAberta = canal:<id>:contato:<id>`.
- Mensagem: `canalIntegracaoId + externalId`.

Chamadas concorrentes dependem de unique constraints e tratamento de conflito para retornar o mesmo registro.

## Banco descartavel

Comandos CMD usados para validar localmente:

```cmd
cd /d C:\Users\vande\crm-saas-frontend\backend
set DATABASE_URL=file:./channel-foundation-copy.db
npx prisma migrate deploy
set DATABASE_URL=
```

Os bancos descartaveis devem ser removidos ao final:

```cmd
cd /d C:\Users\vande\crm-saas-frontend\backend
del prisma\channel-foundation-copy.db
del prisma\channel-foundation-copy.db-journal
del prisma\channel-foundation-copy.db-wal
del prisma\channel-foundation-copy.db-shm
```

## Seguranca

- Nenhuma conta real do WhatsApp.
- Nenhuma chamada a Meta.
- Nenhuma credencial.
- Nenhum token.
- Nenhum telefone real.
- Nenhum payload bruto.
- Nenhum header armazenado.
- Nenhum Cliente, Nota, Acompanhamento ou Funil alterado.

## Proximos passos

1. Publicar a migration somente apos revisao.
2. Migrar models comerciais para multiempresa antes de registrar atendimento no CRM.
3. Adicionar webhook Meta somente em etapa separada.
4. Adicionar assinatura `X-Hub-Signature-256` somente quando houver webhook.
5. Vincular `ContatoCanal` a `Cliente` somente apos `Cliente.empresaId`.
