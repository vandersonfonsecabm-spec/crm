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
- Token demo e papeis `GERENTE`/`VENDEDOR` sao bloqueados.
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
