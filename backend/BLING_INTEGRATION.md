# Integração Bling em modo somente leitura

Esta integração conecta o CRM Agro SaaS à API v3 do Bling usando OAuth 2.0. A primeira versão é somente leitura: sincroniza catálogo, estoque, preços e formas de pagamento para os modelos canônicos do Hub.

## Documentação oficial consultada

Fonte oficial: https://developer.bling.com.br/

Pontos confirmados no portal oficial:

- OAuth 2.0 com authorization code em `https://www.bling.com.br/Api/v3/oauth/authorize`.
- Troca e renovação de tokens em `https://api.bling.com.br/Api/v3/oauth/token`.
- Header `enable-jwt: 1` para receber tokens JWT no fluxo atual.
- Authorization code expira em 1 minuto.
- `access_token` retorna `expires_in` e deve ser renovado com `refresh_token`.
- Produtos: `GET /produtos`.
- Categorias de produto: `GET /categorias/produtos`.
- Estoque: `GET /estoques/saldos` e `GET /estoques/saldos/{idDeposito}`.
- Formas de pagamento: `GET /formas-pagamentos`.
- Limites: 3 requisições por segundo e 120.000 por dia por conta, com resposta 429 quando atingido.
- Webhooks oficiais disponíveis para Produto e Estoque, mas não implementados nesta etapa.
- Os escopos são configurados no cadastro do aplicativo Bling. A URL de autorização desta etapa não envia `scope`, seguindo a orientação oficial de usar os valores previamente cadastrados.

## Variáveis

Defina somente no backend:

```env
BLING_CLIENT_ID=""
BLING_CLIENT_SECRET=""
BLING_REDIRECT_URI=""
BLING_TIMEOUT_MS="15000"
BLING_MAX_PAGES="50"
BLING_PAGE_SIZE="100"
```

Também é obrigatória a chave do Hub:

```env
INTEGRATION_ENCRYPTION_KEY=""
```

Nunca versionar valores reais.

## Rotas

- `POST /integracoes/bling/iniciar`: ADMIN real inicia OAuth e recebe a URL oficial de autorização.
- `GET /integracoes/bling/callback`: recebe `code` e `state`, troca tokens e cria integração `BLING`.
- `POST /integracoes/:id/bling/testar`: valida credenciais com uma chamada segura.
- `POST /integracoes/:id/bling/desconectar`: revoga tokens em melhor esforço, remove credenciais locais e inativa a integração.
- `POST /integracoes/:id/sincronizar`: sincroniza entidades em modo somente leitura.

Payload inicial de sincronização:

```json
{
  "entidades": ["PRODUTOS", "ESTOQUE", "PRECOS", "CONDICOES_PAGAMENTO"]
}
```

## Segurança

- Apenas ADMIN real acessa as rotas.
- GERENTE e VENDEDOR são bloqueados pelo middleware de papel existente.
- `state` OAuth é aleatório, associado a empresa/usuário, salvo como SHA-256 em `IntegracaoOAuthState`, expira em 10 minutos e é de uso único.
- `client_secret`, `access_token` e `refresh_token` nunca são enviados ao frontend.
- Tokens são criptografados com AES-256-GCM via `INTEGRATION_ENCRYPTION_KEY`.
- Logs e erros retornam mensagens sanitizadas.
- A URL de callback aceita somente `code` e `state` retornados pelo provedor; a empresa vem do state persistido, nunca do frontend.
- O redirect final usa `FRONTEND_URL` configurado no backend.

## Normalização

Produtos do Bling são gravados em `ProdutoExterno` com chave única:

```text
integracaoId + externalId
```

Sincronizações repetidas atualizam os registros existentes e não duplicam produtos.

Estoque é gravado em `EstoqueExterno`; ausência de estoque não é tratada como zero. Preços são gravados em centavos em `PrecoExterno`. Formas de pagamento são gravadas em `CondicaoPagamentoExterna` somente quando campos oficiais estiverem disponíveis.

## Renovação de token

Antes de chamadas ao Bling, o cliente verifica `expiresAt`. Se o token estiver vencido ou perto de expirar, usa o `refresh_token` no endpoint oficial de token. Se o Bling retornar novo refresh token, o valor é rotacionado e salvo criptografado. Em falha de renovação, a integração pode ser marcada como `ERRO`, sem apagar dados já sincronizados.

## Rate limit e paginação

O cliente usa `pagina` e `limite`, com `BLING_MAX_PAGES` e `BLING_PAGE_SIZE` para limitar varreduras. Em HTTP 429, respeita `Retry-After` quando presente e faz retry controlado. Não há retry automático em erros 400 ou 403.

## Limitações desta etapa

- Não há escrita no Bling.
- Não cria pedidos.
- Não emite notas fiscais.
- Não altera estoque no ERP.
- Não implementa webhooks.
- Não configura credenciais reais automaticamente em produção.
- Não sincroniza categorias em tabela própria; a categoria do produto é armazenada no campo canônico `ProdutoExterno.categoria`.
- Preços são extraídos dos campos de produto disponíveis; tabelas avançadas de preço podem exigir endpoint específico em etapa futura.

## Como testar localmente

1. Defina `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`, `BLING_REDIRECT_URI` e `INTEGRATION_ENCRYPTION_KEY`.
2. Entre no frontend com ADMIN real.
3. Abra `Integrações`.
4. Clique em `Conectar Bling`.
5. Autorize no Bling.
6. Use `Testar conexão`.
7. Use `Sincronizar agora`.

Em testes automatizados, use mock HTTP. Não chame a API real do Bling.

## Ativação em produção

1. Criar o aplicativo no Bling.
2. Configurar a URL de redirecionamento para `https://api-production-875f9.up.railway.app/integracoes/bling/callback`.
3. Configurar no Railway `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET` e `BLING_REDIRECT_URI`.
4. Confirmar que `INTEGRATION_ENCRYPTION_KEY` está configurada.
5. Publicar o backend.
6. Aplicar apenas migrations pendentes com `npx prisma migrate deploy`.
7. Entrar como ADMIN real e usar `Conectar Bling`.

## Rollback

Se a publicação falhar:

1. Não executar sincronizações novas.
2. Voltar o deployment para o commit anterior.
3. Restaurar o backup SQLite se houver corrupção ou migration indevida.
4. Remover temporariamente as variáveis Bling se a inicialização depender delas.
5. Validar login normal, Hub CSV/XLSX e catálogo comercial.
