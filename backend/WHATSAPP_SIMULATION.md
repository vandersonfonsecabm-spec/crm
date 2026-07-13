# Simulador de Atendimento WhatsApp

## Objetivo

Esta fundacao permite testar, localmente e de forma administrativa, o fluxo de atendimento futuro do WhatsApp sem usar a API da Meta, sem webhook, sem numero real e sem envio de mensagens.

Fluxo implementado:

Mensagem ficticia -> canal de teste -> contato -> conversa -> mensagem recebida -> intencao deterministica -> catalogo canonico -> Cliente -> Nota -> Funil -> Acompanhamento quando necessario -> resposta preparada.

## Escopo

Incluido:

- rota administrativa `POST /whatsapp/simular-mensagem`;
- parser e validacao do payload;
- deteccao deterministica de intencao;
- consulta ao catalogo comercial canonico (`ProdutoExterno`);
- criacao ou reutilizacao de Cliente por empresa e telefone normalizado;
- Nota para intencoes comerciais;
- atualizacao segura do Funil usando `Cliente.status`;
- Acompanhamento quando a resposta exige acao humana;
- mensagem de saida com status `PREPARADA`;
- idempotencia por `canalIntegracaoId + externalId`.

Fora do escopo:

- webhook da Meta;
- assinatura `X-Hub-Signature-256`;
- cliente HTTP da Meta;
- envio real;
- anexos;
- IA generativa;
- frontend do simulador;
- integracao com Bling.

## Catalogo Utilizado

O simulador usa somente o catalogo canonico do Hub, via `commercialCatalogService`, filtrando sempre por `empresaId`.

Nao usa:

- `Produto`;
- `CategoriaProduto`;
- `MovimentacaoEstoque`;
- dados globais de estoque interno.

Isso evita responder para uma empresa usando produtos ou estoques de outra.

## Rota

`POST /whatsapp/simular-mensagem`

Acesso:

- `ADMIN` real: permitido;
- sem autenticacao: `401`;
- `GERENTE`: `403`;
- `VENDEDOR`: `403`;
- sem token: `401`;
- token invalido: `401`.

Payload permitido:

```json
{
  "externalId": "msg-001",
  "canalIntegracaoId": 1,
  "telefone": "+55 (11) 98888-0001",
  "nome": "Cliente Teste",
  "mensagem": "Qual o preco da SKU-HID-20?"
}
```

Campos proibidos incluem `empresaId`, `clienteId`, `notaId`, `acompanhamentoId`, `token`, `credencial`, `url` e campos extras.

Se `canalIntegracaoId` nao for informado, o canal `whatsapp-meta-test` da empresa autenticada e criado ou reutilizado em modo de teste.

## Intencoes

O simulador nao usa IA. As intencoes sao regras deterministicas:

- `SAUDACAO`;
- `CONSULTAR_PRODUTO`;
- `CONSULTAR_PRECO`;
- `CONSULTAR_ESTOQUE`;
- `CONSULTAR_DISPONIBILIDADE`;
- `CONSULTAR_PROMOCAO`;
- `FALAR_COM_VENDEDOR`;
- `NAO_COMPREENDIDA`.

A analise normaliza caixa e acentos para classificar, mas preserva o texto original na mensagem armazenada.

## Cliente, Nota, Funil e Acompanhamento

Cliente:

- localizado por `empresaId` autenticado e telefone normalizado;
- nunca localizado globalmente;
- criado com origem `WhatsApp Simulado` quando nao existe.

Nota:

- criada apenas para intencoes comerciais;
- contem marcador interno `[whatsapp-sim:<externalId>]`;
- nao armazena payload bruto.

Funil:

- usa `Cliente.status`;
- cliente novo com intencao comercial inicia como `Lead`;
- `Lead` pode avancar para `Contato`;
- etapas avancadas, `Fechado` e `Perdido` nao sao rebaixadas.

Acompanhamento:

- criado para falar com vendedor, produto nao encontrado, estoque desconhecido ou caso que exige acao humana;
- reutilizado quando ja existe pendencia equivalente;
- nao duplicado em reentrega.

## Idempotencia

A mensagem recebida e unica por `canalIntegracaoId + externalId`.

A resposta preparada usa externalId derivado:

`<externalId>:prepared-response`

Ao repetir a simulacao, o endpoint retorna `duplicada: true` e nao cria novamente:

- contato;
- conversa aberta;
- Cliente;
- Nota;
- Acompanhamento;
- resposta preparada.

## Seguranca

- `empresaId` vem exclusivamente da autenticacao;
- telefone completo nao deve ser logado;
- payload bruto nao e armazenado;
- erro de API e sanitizado;
- nao ha chamada externa;
- nao ha token Meta;
- nao ha credenciais;
- Bling nao e chamado.

## Migration

Nenhuma migration foi criada nesta etapa.

O vinculo Contato-Cliente foi mantido logico por telefone normalizado e `empresaId`, sem adicionar `clienteId` em `ContatoCanal`. Essa decisao evita schema novo enquanto ainda nao existe inbox real ou vinculo manual de contatos.

## Como Testar em CMD

```bat
cd /d C:\Users\vande\crm-saas-frontend\backend
node --test tests\whatsapp-simulation.test.js
npm test
```

Nao executar seed, `prisma db push`, reset ou migration em producao para este simulador local.

## Proximos Passos

- criar frontend administrativo do simulador;
- criar inbox operacional;
- adicionar webhook real da Meta;
- validar assinatura `X-Hub-Signature-256`;
- mapear status entregue/lido;
- definir politica para vinculo manual ContatoCanal -> Cliente;
- somente depois avaliar IA ou automacoes.
