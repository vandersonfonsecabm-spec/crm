# Importacao manual de dados

Este documento descreve a importacao manual do Hub de Integracoes. O recurso e local ao backend Express atual e nao executa integracoes externas.

## Formatos aceitos

- CSV (`.csv`) com separadores virgula, ponto e virgula ou tabulacao.
- XLSX (`.xlsx`) usando apenas a primeira planilha.

Arquivos `.xls`, `.xlsm`, executaveis e formatos fora da lista sao rejeitados. Macros nao sao executadas.

## Limites

Os limites podem ser ajustados por ambiente:

- `IMPORT_MAX_FILE_SIZE_BYTES`: tamanho maximo do arquivo. Padrao: 10 MB.
- `IMPORT_MAX_ROWS`: maximo de linhas. Padrao: 50.000.
- `IMPORT_MAX_COLUMNS`: maximo de colunas. Padrao: 100.
- `IMPORT_MAX_ERRORS`: maximo de erros persistidos por importacao. Padrao: 1.000.
- `IMPORT_BATCH_SIZE`: tamanho do lote de processamento. Padrao: 500.

## Seguranca

- Apenas `ADMIN` pode importar.
- Papeis `GERENTE`/`VENDEDOR` sao bloqueados.
- O nome original do arquivo e sanitizado.
- O arquivo e salvo apenas em diretorio temporario interno.
- O conteudo bruto nao e persistido no SQLite.
- Erros guardam apenas linha, campo, codigo, mensagem e valor sanitizado.
- Nenhum secret, senha ou credencial e registrado.

## Fluxo de API

### 1. Upload e analise

`POST /importacoes/upload`

Tipo: `multipart/form-data`

Campos:

- `arquivo`: arquivo CSV ou XLSX.
- `tipoEntidade`: opcional nesta fase; somente `PRODUTOS` e aceito.
- `confirmarReprocessamento`: opcional. Use `true` para permitir novo upload de um hash ja importado.

Resposta:

- importacao criada;
- formato;
- nome sanitizado;
- tamanho;
- hash;
- colunas detectadas;
- colunas duplicadas;
- sugestao de mapeamento;
- primeiras linhas de previa;
- total estimado de linhas.

### 2. Mapeamento

`POST /importacoes/:id/mapear`

Exemplo:

```json
{
  "mapeamento": {
    "externalId": "id",
    "sku": "sku",
    "nome": "nome",
    "categoria": "categoria",
    "marca": "marca",
    "unidade": "unidade",
    "quantidade": "estoque",
    "reservado": "reservado",
    "precoCentavos": "preco"
  },
  "opcoes": {
    "monetario": {
      "precoCentavos": "REAIS_VIRGULA"
    }
  }
}
```

Campos canonicos de produto:

- `externalId`, `sku`, `codigoBarras`, `nome`, `descricao`, `categoria`, `marca`, `unidade`, `ativo`;
- `quantidade`, `reservado`, `disponivel`, `localExternalId`, `localNome`;
- `precoCentavos`, `precoPromocionalCentavos`, `tabelaPreco`, `inicioPromocao`, `fimPromocao`.

Obrigatorio: `nome` e pelo menos um identificador entre `externalId`, `sku` ou `codigoBarras`.

Modos monetarios:

- `CENTAVOS`: valor inteiro ja em centavos.
- `REAIS_VIRGULA`: exemplo `1.250,50`.
- `REAIS_PONTO`: exemplo `1250.50`.

### 3. Validacao

`POST /importacoes/:id/validar`

Valida todas as linhas sem persistir produtos. Erros por linha sao registrados em `ErroImportacao`.

Codigos comuns:

- `MISSING_EXTERNAL_KEY`;
- `MISSING_NAME`;
- `DUPLICATE_IN_FILE`;
- `INVALID_PRICE`;
- `INVALID_DECIMAL`;
- `NEGATIVE_NUMBER`;
- `INVALID_DATE`;
- `INVALID_BARCODE`;
- `NEGATIVE_AVAILABLE`.

### 4. Processamento

`POST /importacoes/:id/processar`

Exemplo:

```json
{
  "importarLinhasValidas": true,
  "estrategiaAtualizacao": "CRIAR_E_ATUALIZAR"
}
```

Estrategias:

- `CRIAR_E_ATUALIZAR`: cria novos produtos externos e atualiza existentes.
- `APENAS_CRIAR`: ignora produtos externos ja existentes.
- `APENAS_ATUALIZAR`: ignora produtos externos inexistentes.

A chave de idempotencia do produto externo e `integracaoId + externalId`. Importacoes manuais criam ou reutilizam uma integracao do tipo `CSV` ou `XLSX` para a empresa autenticada.

## Estoque e preco

- `EstoqueExterno` e criado/atualizado quando a coluna de quantidade existe.
- `reservado` e opcional.
- `disponivel` e calculado como `quantidade - reservado` se nao vier no arquivo.
- Disponivel negativo e erro.
- `PrecoExterno` usa centavos inteiros.
- O Hub nao altera `Produto`, `CategoriaProduto` ou movimentacoes do estoque interno.

## Consulta

`GET /hub/produtos`

Filtros:

- `busca` ou `nome`;
- `sku`;
- `codigoBarras`;
- `categoria`;
- `marca`;
- `integracaoId`;
- `apenasComEstoque`;
- `precoMinimo`/`precoMinimoCentavos`;
- `precoMaximo`/`precoMaximoCentavos`;
- `page`;
- `limit`.

## Erros de importacao

`GET /importacoes/:id/erros`

Filtros:

- `campo`;
- `codigo`;
- `linha`;
- `page`;
- `limit`.

## Cancelamento

`POST /importacoes/:id/cancelar`

Permitido antes de conclusao e fora do processamento irreversivel. Importacoes concluidas nao sao canceladas.

## Fixtures e testes

Fixtures ficticias ficam em `tests/fixtures/importacoes/`:

- CSV valido;
- CSV com ponto e virgula;
- CSV parcialmente invalido;
- CSV duplicado;
- XLSX valido;
- XLSX parcialmente invalido;
- arquivo vazio;
- extensao invalida.

Execute:

```bash
npm test
```

ou apenas:

```bash
node --test tests/importacao-manual.test.js
```

## Consulta comercial unificada

A rota `GET /hub/consulta-comercial` consolida produto, estoque, preco, origem e avisos em uma unica resposta para uso futuro por atendimento humano ou bot. Ela nao consulta adaptadores externos diretamente; usa somente a base canonica sincronizada/importada.

Filtros:

- `q`: busca em nome, SKU, codigo de barras, descricao, marca e categoria.
- `sku`.
- `codigoBarras`.
- `categoria`.
- `marca`.
- `local`.
- `somenteDisponiveis`.
- `pagina` ou `page`.
- `limite` ou `limit`, limitado a 100.

Campos principais da resposta:

- identificadores canonicos e externos;
- nome, descricao, SKU, codigo de barras, categoria, marca, unidade e status ativo;
- estoques por local;
- totais de quantidade, reservado e disponivel;
- disponibilidade `EM_ESTOQUE`, `SEM_ESTOQUE`, `INDISPONIVEL` ou `DESCONHECIDO`;
- preco atual, preco original, promocao vigente e periodo;
- origem da integracao;
- ultima sincronizacao;
- `dadosDesatualizados` e avisos.

Promocao vigente exige preco promocional e janela de datas valida: agora deve ser maior ou igual ao inicio, quando informado, e menor ou igual ao fim, quando informado.

`HUB_DATA_STALE_AFTER_MINUTES` define quando dados canonicos passam a retornar aviso de desatualizacao. O padrao local e 60 minutos.

## Qualidade dos dados

A rota `GET /hub/qualidade-dados` retorna metricas operacionais da base canonica da empresa autenticada:

- total de produtos;
- ativos e inativos;
- sem SKU;
- sem codigo de barras;
- sem estoque;
- sem preco;
- dados desatualizados;
- duplicidades detectadas;
- integracoes de origem;
- ultima importacao;
- ultima sincronizacao.

## Servico interno para atendimento

O backend possui funcoes internas sem LLM e sem token publico:

- `consultarCatalogoComercial`;
- `buscarProdutoParaAtendimento`;
- `consultarEstoqueParaAtendimento`;
- `consultarPrecoParaAtendimento`.

Todas exigem `empresaId` e limites seguros. Elas nao acessam adaptadores quando a base canonica ja possui dados sincronizados.
