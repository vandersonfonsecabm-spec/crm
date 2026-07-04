# Hub de Integracoes

## Objetivo

O Hub de Integracoes prepara o CRM Agro SaaS para atuar como uma camada confiavel de dados comerciais e operacionais. Ele centraliza conexoes futuras com ERPs, PDVs, arquivos manuais e conectores customizados sem dar acesso direto ao banco para agentes externos.

Nesta fase, todos os conectores ficam em modo somente leitura e nenhum adaptador chama APIs externas.

## Principios

- Toda integracao pertence a uma empresa.
- O tenant vem do JWT autenticado, nunca do body.
- Credenciais nao ficam no frontend e nao sao salvas em texto puro.
- O CRM mantem um modelo canonico proprio para produtos, estoque, precos e condicoes.
- Falhas sao registradas com detalhes sanitizados.
- Importacoes guardam metadados e historico, mas nao armazenam arquivos no SQLite.
- Nenhum conector altera clientes, produtos internos ou estoque interno sem uma regra futura explicita.
- Operacoes devem ser idempotentes quando o conector e a origem permitirem.

## Variaveis

- `INTEGRATION_ENCRYPTION_KEY`: chave exclusiva para criptografia de credenciais de integracoes.

Nao reutilizar `JWT_SECRET`. Nao versionar valor real. Em producao, se houver integracao ativa com credenciais e a chave estiver ausente, a API deve falhar na inicializacao.

## Modelos

- `Integracao`: cadastro por empresa, tipo, status, modo, configuracao sem secrets e credenciais criptografadas.
- `SincronizacaoIntegracao`: historico de tentativas de sincronizacao.
- `ErroIntegracao`: erros sanitizados e reprocessaveis.
- `ProdutoExterno`: produto canonico importado de ERP, PDV ou arquivo.
- `EstoqueExterno`: saldo externo por local.
- `PrecoExterno`: tabela de preco externa em centavos.
- `CondicaoPagamentoExterna`: condicoes externas.
- `ImportacaoDados`: metadados de arquivos manuais.
- `ErroImportacao`: erros por linha/campo.

## Tipos iniciais

Integracoes:

- `BLING`
- `OMIE`
- `CONTA_AZUL`
- `TINY`
- `ALTERDATA`
- `CSV`
- `XLSX`
- `XML`
- `JSON`
- `CUSTOM`

Formatos de importacao:

- `CSV`
- `XLSX`
- `XML`
- `JSON`

## Criptografia

O servico `src/integrations/crypto.js` usa AES-256-GCM com IV unico por criptografia. O payload salvo contem versao, algoritmo, IV, tag e dados cifrados.

As rotas retornam apenas `possuiCredenciais: true/false`. Credenciais descriptografadas nunca devem ser retornadas ao frontend.

## Adaptadores

Contrato interno:

- `testConnection`
- `fetchProducts`
- `fetchStock`
- `fetchPrices`
- `fetchPaymentTerms`

Adaptadores criados como stubs seguros:

- `BlingAdapter`
- `OmieAdapter`
- `ContaAzulAdapter`
- `TinyAdapter`
- `AlterdataAdapter`
- `CsvAdapter`
- `XlsxAdapter`
- `XmlAdapter`
- `JsonAdapter`
- `CustomAdapter`

Enquanto nao implementados, retornam erro controlado `CONNECTOR_NOT_IMPLEMENTED`.

## Rotas administrativas

Todas exigem JWT real de usuario ADMIN. Token demo nao acessa o Hub.

### Integracoes

- `GET /integracoes`
- `GET /integracoes/:id`
- `POST /integracoes`
- `PATCH /integracoes/:id`
- `POST /integracoes/:id/testar`

### Sincronizacoes

- `GET /integracoes/:id/sincronizacoes`
- `GET /sincronizacoes/:id`

### Importacoes

- `GET /importacoes`
- `GET /importacoes/:id`
- `POST /importacoes/metadados`

O POST registra somente metadados. Upload real ainda nao existe.

### Consulta canonica

- `GET /hub/produtos`

Filtros:

- `busca`
- `nome`
- `sku`
- `codigoBarras`
- `categoria`
- `integracaoId`
- `page`
- `limit`

## Erros

Codigos usados:

- `INTEGRATION_NOT_FOUND`
- `INTEGRATION_ACCESS_DENIED`
- `INTEGRATION_INVALID_TYPE`
- `CONNECTOR_NOT_IMPLEMENTED`
- `INTEGRATION_CREDENTIALS_REQUIRED`
- `INTEGRATION_CREDENTIALS_INVALID`
- `IMPORT_INVALID_FORMAT`
- `IMPORT_FILE_TOO_LARGE`
- `IMPORT_MAPPING_REQUIRED`
- `SYNC_NOT_FOUND`
- `ENCRYPTION_KEY_REQUIRED`

## Como adicionar um novo ERP

1. Adicionar o tipo no enum `TipoIntegracao`.
2. Criar um adaptador em `src/integrations/adapters.js` ou arquivo dedicado.
3. Registrar o adaptador na fabrica `createIntegrationAdapter`.
4. Implementar primeiro `testConnection`.
5. Implementar leitura de produtos, estoque, precos e condicoes.
6. Sanitizar payloads antes de persistir.
7. Criar testes sem credenciais reais.

## Limitacoes atuais

- Nenhuma API externa e chamada.
- Nao ha upload de arquivo.
- Nao ha jobs ou agendamento de sincronizacao.
- Nao ha escrita em ERP.
- Nao ha vinculacao automatica entre `ProdutoExterno` e `Produto`.
- O Hub ainda nao e exposto para agentes de IA.

## Proximos passos tecnicos

- Implementar upload seguro em volume/storage fora do SQLite.
- Criar workers de sincronizacao.
- Implementar Bling ou Omie como primeiro adaptador real.
- Criar reconciliacao entre produtos externos e produtos internos.
- Criar auditoria de alteracoes por usuario.
- Definir politica de retencao de logs e payloads sanitizados.

## Importacao manual CSV/XLSX

A fundacao operacional do Hub permite importar produtos externos, estoque e precos por arquivos CSV ou XLSX usando o fluxo:

1. `POST /importacoes/upload` recebe um arquivo temporario, calcula SHA-256, detecta colunas e retorna previa.
2. `POST /importacoes/:id/mapear` salva o mapeamento entre colunas do arquivo e campos canonicos.
3. `POST /importacoes/:id/validar` valida todas as linhas e registra erros sanitizados por linha em `ErroImportacao`.
4. `POST /importacoes/:id/processar` importa as linhas validas para `ProdutoExterno`, `EstoqueExterno` e `PrecoExterno`.
5. `GET /hub/produtos` consulta os produtos externos importados, sem misturar com o estoque interno do CRM.

O upload e o processamento sao restritos a usuarios `ADMIN`. Token demo, `GERENTE` e `VENDEDOR` nao podem executar importacao. Os arquivos sao temporarios, nao sao gravados no SQLite e sao removidos apos analise/processamento ou cancelamento.

Variaveis de limite:

- `IMPORT_MAX_FILE_SIZE_BYTES` padrao `10485760`.
- `IMPORT_MAX_ROWS` padrao `50000`.
- `IMPORT_MAX_COLUMNS` padrao `100`.
- `IMPORT_MAX_ERRORS` padrao `1000`.
- `IMPORT_BATCH_SIZE` padrao `500`.

Consulte `IMPORTACAO_DADOS.md` para exemplos de payloads, estrategias e validacoes.
