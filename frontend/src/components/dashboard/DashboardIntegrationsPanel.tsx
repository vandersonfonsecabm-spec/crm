import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Filter,
  Loader2,
  PackageSearch,
  PlugZap,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  cancelarImportacao,
  consultarCatalogoComercial,
  desconectarBling,
  fetchErrosImportacao,
  fetchImportacao,
  fetchImportacoes,
  fetchIntegracoes,
  fetchQualidadeDados,
  iniciarConexaoBling,
  mapearImportacao,
  processarImportacao,
  sincronizarIntegracao,
  testarConexaoBling,
  uploadImportacao,
  validarImportacao,
  type HubBlingSyncResponse,
  type HubCanonicalField,
  type HubErroImportacao,
  type HubIntegracao,
  type HubImportacaoDados,
  type HubImportacaoMapeamentoResponse,
  type HubImportacaoProcessamentoResponse,
  type HubImportacaoUploadResponse,
  type HubImportacaoValidacaoResponse,
  type HubImportStatus,
  type HubMoneyMode,
  type HubProdutoComercial,
  type HubQualidadeDados,
  type HubUpdateStrategy,
} from "../../services/crmApi";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const IMPORT_LIMIT = 6;
const ERROR_LIMIT = 8;
const CATALOG_LIMIT = 6;
const IGNORE_FIELD = "__ignore__";
const IMPORT_DRAFT_PREFIX = "crm-hub-import-draft:";

const CANONICAL_FIELDS: Array<{ value: HubCanonicalField; label: string }> = [
  { value: "externalId", label: "Código externo" },
  { value: "sku", label: "SKU" },
  { value: "codigoBarras", label: "Código de barras" },
  { value: "nome", label: "Nome" },
  { value: "descricao", label: "Descrição" },
  { value: "categoria", label: "Categoria" },
  { value: "marca", label: "Marca" },
  { value: "unidade", label: "Unidade" },
  { value: "ativo", label: "Ativo" },
  { value: "quantidade", label: "Quantidade" },
  { value: "reservado", label: "Reservado" },
  { value: "disponivel", label: "Disponível" },
  { value: "localExternalId", label: "Codigo do local" },
  { value: "localNome", label: "Nome do local" },
  { value: "precoCentavos", label: "Preço" },
  { value: "precoPromocionalCentavos", label: "Preço promocional" },
  { value: "tabelaPreco", label: "Tabela de preço" },
  { value: "inicioPromocao", label: "Início da promoção" },
  { value: "fimPromocao", label: "Fim da promoção" },
];

const STATUS_OPTIONS = ["Todos", "MAPEAMENTO_PENDENTE", "VALIDANDO", "PRONTO", "PROCESSANDO", "CONCLUIDO", "CONCLUIDO_COM_ERROS", "FALHOU", "CANCELADO"];
const FORMAT_OPTIONS = ["Todos", "CSV", "XLSX"];
const STRATEGIES: Array<{ value: HubUpdateStrategy; label: string }> = [
  { value: "CRIAR_E_ATUALIZAR", label: "Criar e atualizar" },
  { value: "APENAS_CRIAR", label: "Apenas criar" },
  { value: "APENAS_ATUALIZAR", label: "Apenas atualizar" },
];
const MONEY_MODES: Array<{ value: HubMoneyMode; label: string }> = [
  { value: "REAIS_VIRGULA", label: "Reais com virgula" },
  { value: "REAIS_PONTO", label: "Reais com ponto" },
  { value: "CENTAVOS", label: "Valor em centavos" },
];

type StepKey = "arquivo" | "mapeamento" | "validacao" | "importacao" | "resultado";
type LoadState = "loading" | "success" | "error";
type ImportErrors = { data: HubErroImportacao[]; page: number; total: number; totalPages: number };

export default function DashboardIntegrationsPanel() {
  const [state, setState] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [step, setStep] = useState<StepKey>("arquivo");
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<HubImportacaoUploadResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, HubCanonicalField | typeof IGNORE_FIELD>>({});
  const [priceMode, setPriceMode] = useState<HubMoneyMode>("REAIS_VIRGULA");
  const [promoMode, setPromoMode] = useState<HubMoneyMode>("REAIS_VIRGULA");
  const [mappingResult, setMappingResult] = useState<HubImportacaoMapeamentoResponse | null>(null);
  const [validation, setValidation] = useState<HubImportacaoValidacaoResponse | null>(null);
  const [processResult, setProcessResult] = useState<HubImportacaoProcessamentoResponse | null>(null);
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [strategy, setStrategy] = useState<HubUpdateStrategy>("CRIAR_E_ATUALIZAR");
  const [errors, setErrors] = useState<ImportErrors>({ data: [], page: 1, total: 0, totalPages: 0 });
  const [imports, setImports] = useState<HubImportacaoDados[]>([]);
  const [importsTotal, setImportsTotal] = useState(0);
  const [importsPage, setImportsPage] = useState(1);
  const [importStatus, setImportStatus] = useState("Todos");
  const [importFormat, setImportFormat] = useState("Todos");
  const [importSearch, setImportSearch] = useState("");
  const [selectedImport, setSelectedImport] = useState<HubImportacaoDados | null>(null);
  const [catalog, setCatalog] = useState<HubProdutoComercial[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogFilters, setCatalogFilters] = useState({ q: "", sku: "", codigoBarras: "", categoria: "", marca: "", local: "", somenteDisponiveis: false });
  const [quality, setQuality] = useState<HubQualidadeDados | null>(null);
  const [blingIntegrations, setBlingIntegrations] = useState<HubIntegracao[]>([]);
  const [blingBusy, setBlingBusy] = useState<"connect" | "test" | "sync" | "disconnect" | null>(null);
  const [blingMessage, setBlingMessage] = useState("");
  const [lastBlingSync, setLastBlingSync] = useState<HubBlingSyncResponse | null>(null);

  const importPages = Math.max(1, Math.ceil(importsTotal / IMPORT_LIMIT));
  const catalogPages = Math.max(1, Math.ceil(catalogTotal / CATALOG_LIMIT));
  const invalidLines = validation?.resumo.linhasComErro ?? mappingResult?.linhasInvalidasEstimadas ?? 0;

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importsPage, catalogPage]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const filteredImports = useMemo(() => {
    const term = importSearch.trim().toLowerCase();
    return imports.filter((item) => {
      const byStatus = importStatus === "Todos" || item.status === importStatus;
      const byFormat = importFormat === "Todos" || item.formato === importFormat;
      const bySearch = !term || item.nomeArquivo.toLowerCase().includes(term);
      return byStatus && byFormat && bySearch;
    });
  }, [importFormat, importSearch, importStatus, imports]);

  async function loadAll() {
    try {
      const [importList, catalogList, qualityData, blingList] = await Promise.all([
        fetchImportacoes({ page: importsPage, limit: IMPORT_LIMIT }),
        consultarCatalogoComercial({ ...catalogFilters, pagina: catalogPage, limite: CATALOG_LIMIT }),
        fetchQualidadeDados(),
        fetchIntegracoes({ tipo: "BLING", limit: 10 }),
      ]);
      setImports(importList.data);
      setImportsTotal(importList.pagination.total);
      setCatalog(catalogList.data);
      setCatalogTotal(catalogList.pagination.total);
      setQuality(qualityData);
      setBlingIntegrations(blingList.data);
      setState("success");
      setMessage("");
    } catch (error) {
      setState("error");
      setMessage(errorText(error, "Não foi possível carregar as integrações."));
    }
  }

  async function reloadImports() {
    const importList = await fetchImportacoes({ page: importsPage, limit: IMPORT_LIMIT });
    setImports(importList.data);
    setImportsTotal(importList.pagination.total);
  }

  async function reloadCatalog(page = catalogPage) {
    const catalogList = await consultarCatalogoComercial({ ...catalogFilters, pagina: page, limite: CATALOG_LIMIT });
    setCatalog(catalogList.data);
    setCatalogTotal(catalogList.pagination.total);
  }

  async function reloadQuality() {
    setQuality(await fetchQualidadeDados());
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFileError("");
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["csv", "xlsx"].includes(extension)) {
      setFileError("Formato não permitido. Use CSV ou XLSX.");
      event.target.value = "";
      return;
    }
    if (file.size <= 0) {
      setFileError("O arquivo esta vazio.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError("O arquivo excede o limite operacional de 10 MB.");
      event.target.value = "";
      return;
    }
    setSelectedFile(file);
  }

  async function sendFile(confirmarReprocessamento = false) {
    if (!selectedFile) {
      setFileError("Selecione um arquivo CSV ou XLSX.");
      return;
    }
    setBusy(true);
    setFileError("");
    try {
      const result = await uploadImportacao(selectedFile, { tipoEntidade: "PRODUTOS", confirmarReprocessamento });
      saveImportDraft(result);
      setUpload(result);
      setMapping(invertSuggestion(result.sugestaoMapeamento ?? {}, result.colunasDetectadas));
      setMappingResult(null);
      setValidation(null);
      setProcessResult(null);
      setErrors({ data: [], page: 1, total: 0, totalPages: 0 });
      setSelectedImport(null);
      setStep("mapeamento");
      setToast("Arquivo enviado. Continue com o mapeamento.");
      await reloadImports();
    } catch (error) {
      setFileError(errorText(error, "Não foi possível enviar o arquivo."));
    } finally {
      setBusy(false);
    }
  }

  async function saveMapping() {
    if (!upload) return;
    const fieldMapping = buildFieldMapping(mapping);
    if (!fieldMapping.nome) {
      setMessage("Mapeie a coluna Nome.");
      return;
    }
    if (!fieldMapping.externalId && !fieldMapping.sku && !fieldMapping.codigoBarras) {
      setMessage("Mapeie Código externo, SKU ou Código de barras.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await mapearImportacao(upload.importacao.id, {
        mapping: fieldMapping,
        options: { money: { precoCentavos: priceMode, precoPromocionalCentavos: promoMode } },
        chavePrincipal: fieldMapping.externalId ? "externalId" : fieldMapping.sku ? "sku" : "codigoBarras",
        permitirParcial: true,
      });
      setMappingResult(result);
      setStep("validacao");
      setToast("Mapeamento salvo.");
      await reloadImports();
    } catch (error) {
      setMessage(errorText(error, "Não foi possível salvar o mapeamento."));
    } finally {
      setBusy(false);
    }
  }

  async function validateImport() {
    const id = importId();
    if (!id) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await validarImportacao(id);
      setValidation(result);
      setStep("importacao");
      await loadErrors(id, 1);
      await reloadImports();
      setToast("Arquivo validado.");
    } catch (error) {
      setMessage(errorText(error, "Não foi possível validar o arquivo."));
    } finally {
      setBusy(false);
    }
  }

  async function processImport() {
    const id = importId();
    if (!id || !validation) return;
    if (invalidLines > 0 && !confirmPartial) {
      setMessage("Confirme a importação somente das linhas válidas.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await processarImportacao(id, { importarLinhasValidas: true, estrategiaAtualizacao: strategy });
      setProcessResult(result);
      setStep("resultado");
      setToast(result.importacao.status === "CONCLUIDO" ? "Importação concluída com sucesso." : "Importação concluída com erros.");
      await Promise.all([reloadImports(), reloadCatalog(), reloadQuality()]);
    } catch (error) {
      setMessage(errorText(error, "Não foi possível processar a importação."));
    } finally {
      setBusy(false);
    }
  }

  async function loadErrors(id: number, page: number) {
    const result = await fetchErrosImportacao(id, { page, limit: ERROR_LIMIT });
    setErrors({ data: result.data, page: result.pagination.page, total: result.pagination.total, totalPages: result.pagination.totalPages });
  }

  async function openImport(id: number) {
    setBusy(true);
    try {
      const detail = await fetchImportacao(id);
      setSelectedImport(detail);
      await loadErrors(id, 1);
    } catch (error) {
      setMessage(errorText(error, "Não foi possível abrir a importação."));
    } finally {
      setBusy(false);
    }
  }

  async function resumeImport(id: number) {
    setBusy(true);
    setMessage("");
    try {
      const detail = await fetchImportacao(id);
      setSelectedImport(null);
      setProcessResult(null);

      if (detail.status === "MAPEAMENTO_PENDENTE") {
        const draft = loadImportDraft(detail.id);
        if (!draft) {
          setSelectedImport(detail);
          setMessage("Esta importação está aguardando mapeamento, mas as colunas do arquivo não estão mais carregadas neste navegador. Reenvie o mesmo arquivo para continuar com segurança.");
          return;
        }
        const resumedUpload = { ...draft, importacao: detail, status: detail.status };
        setUpload(resumedUpload);
        setMapping(invertSuggestion(resumedUpload.sugestaoMapeamento ?? {}, resumedUpload.colunasDetectadas));
        setMappingResult(null);
        setValidation(null);
        setErrors({ data: [], page: 1, total: 0, totalPages: 0 });
        setStep("mapeamento");
        setToast("Mapeamento retomado.");
        return;
      }

      setUpload(null);
      if (detail.status === "VALIDANDO") {
        setMappingResult(mappingResultFromImport(detail));
        setValidation(null);
        setStep("validacao");
        setToast("Importação pronta para validar.");
        return;
      }

      if (detail.status === "PRONTO") {
        setMappingResult(mappingResultFromImport(detail));
        setValidation(validationFromImport(detail));
        await loadErrors(detail.id, 1);
        setStep("importacao");
        setToast("Importação pronta para importar linhas válidas.");
        return;
      }

      setSelectedImport(detail);
      await loadErrors(id, 1);
    } catch (error) {
      setMessage(errorText(error, "Não foi possível retomar a importação."));
    } finally {
      setBusy(false);
    }
  }

  async function cancelImport(id: number) {
    setBusy(true);
    try {
      await cancelarImportacao(id);
      setToast("Importação cancelada.");
      await reloadImports();
    } catch (error) {
      setMessage(errorText(error, "Não foi possível cancelar a importação."));
    } finally {
      setBusy(false);
    }
  }

  function importId() {
    return upload?.importacao.id ?? mappingResult?.importacao.id ?? validation?.importacao.id ?? processResult?.importacao.id ?? null;
  }

  function resetFlow() {
    setSelectedFile(null);
    setFileError("");
    setUpload(null);
    setMapping({});
    setMappingResult(null);
    setValidation(null);
    setProcessResult(null);
    setConfirmPartial(false);
    setStrategy("CRIAR_E_ATUALIZAR");
    setErrors({ data: [], page: 1, total: 0, totalPages: 0 });
    setStep("arquivo");
    setMessage("");
  }

  function applyCatalogFilters() {
    setCatalogPage(1);
    void reloadCatalog(1);
  }

  async function connectBling() {
    setBlingBusy("connect");
    setBlingMessage("");
    try {
      const result = await iniciarConexaoBling();
      window.location.href = result.authorizationUrl;
    } catch (error) {
      setBlingMessage(errorText(error, "Não foi possível iniciar a conexão com o Bling."));
    } finally {
      setBlingBusy(null);
    }
  }

  async function testBling(integrationId: number) {
    setBlingBusy("test");
    setBlingMessage("");
    try {
      const result = await testarConexaoBling(integrationId);
      setBlingMessage(result.conectado ? "Conexão Bling validada." : "Não foi possível validar a conexão Bling.");
      await loadAll();
    } catch (error) {
      setBlingMessage(errorText(error, "Não foi possível testar a conexão Bling."));
    } finally {
      setBlingBusy(null);
    }
  }

  async function syncBling(integrationId: number) {
    setBlingBusy("sync");
    setBlingMessage("");
    try {
      const result = await sincronizarIntegracao(integrationId, ["PRODUTOS", "ESTOQUE", "PRECOS", "CONDICOES_PAGAMENTO"]);
      setLastBlingSync(result);
      setBlingMessage(result.sincronizacao.status === "CONCLUIDA" ? "Sincronização Bling concluída." : "Sincronização Bling finalizada com atenção.");
      await Promise.all([loadAll(), reloadCatalog(), reloadQuality()]);
    } catch (error) {
      setBlingMessage(errorText(error, "Não foi possível sincronizar o Bling."));
    } finally {
      setBlingBusy(null);
    }
  }

  async function disconnectBling(integrationId: number) {
    setBlingBusy("disconnect");
    setBlingMessage("");
    try {
      await desconectarBling(integrationId);
      setBlingMessage("Bling desconectado.");
      await loadAll();
    } catch (error) {
      setBlingMessage(errorText(error, "Não foi possível desconectar o Bling."));
    } finally {
      setBlingBusy(null);
    }
  }

  return (
    <div className="space-y-4 overflow-x-hidden">
      {toast && <div className="fixed right-5 top-5 z-50 rounded-2xl border border-emerald-300/20 bg-slate-950/95 px-4 py-3 text-sm font-semibold text-emerald-100 shadow-2xl">{toast}</div>}

      <section className="premium-panel rounded-2xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Hub operacional</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-50">Integrações e Dados</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
              Importe produtos por CSV ou XLSX, valide linhas e consulte o catálogo comercial sincronizado.
            </p>
          </div>
          <button type="button" onClick={() => void loadAll()} className="premium-ghost inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
        {state === "error" && <Alert tone="error">{message || "Não foi possível carregar as integrações."}</Alert>}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Produtos no Hub" value={quality?.totalProdutos ?? 0} icon={<Database size={15} />} />
        <Metric title="Ativos" value={quality?.produtosAtivos ?? 0} icon={<CheckCircle2 size={15} />} />
        <Metric title="Sem estoque" value={quality?.produtosSemEstoque ?? 0} icon={<PackageSearch size={15} />} />
        <Metric title="Dados desatualizados" value={quality?.produtosComDadosDesatualizados ?? 0} icon={<AlertTriangle size={15} />} />
      </section>

      <BlingSection
        integrations={blingIntegrations}
        busy={blingBusy}
        message={blingMessage}
        lastSync={lastBlingSync}
        onConnect={() => void connectBling()}
        onTest={(id) => void testBling(id)}
        onSync={(id) => void syncBling(id)}
        onDisconnect={(id) => void disconnectBling(id)}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <section className="premium-panel rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Importar arquivo</h3>
                <p className="mt-1 text-xs text-slate-500">Fluxo real: upload, mapeamento, validação e processamento.</p>
              </div>
              <button type="button" onClick={resetFlow} className="premium-ghost inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300">
                <RotateCcw size={13} /> Nova importação
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-5">
              {(["arquivo", "mapeamento", "validacao", "importacao", "resultado"] as StepKey[]).map((key, index) => (
                <div key={key} className={`rounded-xl border px-3 py-2 text-xs ${step === key ? "border-teal-300/30 bg-teal-300/[0.08] text-teal-100" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>
                  <span className="text-[10px] text-slate-500">{index + 1}</span>
                  <span className="ml-2 font-semibold">{stepLabel(key)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-xs text-slate-300">
              <span className="font-semibold text-slate-100">Etapa atual: </span>
              {workflowStatusText(step, upload?.importacao.status ?? mappingResult?.importacao.status ?? validation?.importacao.status ?? processResult?.importacao.status)}
            </div>

            {message && <Alert tone="error">{message}</Alert>}

            {step === "arquivo" && (
              <div className="mt-4 space-y-3">
                <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20 p-5 text-center transition hover:border-teal-200/25 hover:bg-teal-300/[0.04]">
                  <UploadCloud className="text-teal-100" size={24} />
                  <span className="mt-2 text-sm font-semibold text-slate-100">Selecionar CSV ou XLSX</span>
                  <span className="mt-1 text-xs text-slate-500">Um arquivo por vez, até 10 MB.</span>
                  <input className="mt-3 block w-full max-w-md cursor-pointer rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-300/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-teal-50 disabled:cursor-not-allowed disabled:opacity-50" type="file" accept=".csv,.xlsx" onChange={onFileChange} disabled={busy} />
                </label>
                {selectedFile && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileSpreadsheet size={18} className="shrink-0 text-teal-100" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">{selectedFile.name}</p>
                        <p className="text-xs text-slate-500">{formatBytes(selectedFile.size)}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setSelectedFile(null)} disabled={busy} className="premium-ghost rounded-xl p-2 text-slate-300"><X size={14} /></button>
                  </div>
                )}
                {fileError && <Alert tone="error">{fileError}</Alert>}
                {fileError.toLowerCase().includes("importado") && (
                  <button type="button" onClick={() => void sendFile(true)} disabled={busy} className="premium-ghost rounded-xl px-3 py-2 text-xs font-semibold text-slate-200">
                    Reprocessar mesmo arquivo com confirmacao
                  </button>
                )}
                <button type="button" onClick={() => void sendFile(false)} disabled={!selectedFile || busy} className="premium-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                  {busy ? <Loader2 className="animate-spin" size={14} /> : <UploadCloud size={14} />} Enviar arquivo
                </button>
              </div>
            )}

            {upload && step !== "arquivo" && <UploadSummary upload={upload} />}

            {step === "mapeamento" && upload && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-2 lg:grid-cols-2">
                  {upload.colunasDetectadas.map((column) => (
                    <div key={column} className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 sm:grid-cols-[minmax(0,1fr)_190px] sm:items-center">
                      <span className="truncate text-xs font-semibold text-slate-200" title={column}>{column}</span>
                      <select value={mapping[column] ?? IGNORE_FIELD} onChange={(event) => setMapping((current) => ({ ...current, [column]: event.target.value as HubCanonicalField | typeof IGNORE_FIELD }))} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-100">
                        <option value={IGNORE_FIELD}>Ignorar</option>
                        {CANONICAL_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <SelectBox label="Preço" value={priceMode} options={MONEY_MODES} onChange={setPriceMode} />
                  <SelectBox label="Preço promocional" value={promoMode} options={MONEY_MODES} onChange={setPromoMode} />
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-xs text-slate-400">
                  <span className="font-semibold text-slate-100">Chave principal: </span>
                  {primaryKeyLabel(buildFieldMapping(mapping))}
                </div>
                <button type="button" onClick={() => void saveMapping()} disabled={busy} className="premium-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50">
                  {busy ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Salvar mapeamento
                </button>
              </div>
            )}

            {mappingResult && ["validacao", "importacao", "resultado"].includes(step) && (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Metric title="Válidas estimadas" value={mappingResult.linhasValidasEstimadas} icon={<CheckCircle2 size={14} />} />
                <Metric title="Inválidas estimadas" value={mappingResult.linhasInvalidasEstimadas} icon={<AlertTriangle size={14} />} />
                <Metric title="Avisos" value={mappingResult.avisos.length} icon={<Filter size={14} />} />
              </div>
            )}

            {step === "validacao" && (
              <button type="button" onClick={() => void validateImport()} disabled={busy} className="mt-4 premium-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50">
                {busy ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Validar arquivo
              </button>
            )}

            {validation && ["importacao", "resultado"].includes(step) && (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-4">
                  <Metric title="Total" value={validation.resumo.totalLinhas} icon={<Database size={14} />} />
                  <Metric title="Válidas" value={validation.resumo.linhasValidas} icon={<CheckCircle2 size={14} />} />
                  <Metric title="Inválidas" value={validation.resumo.linhasComErro} icon={<AlertTriangle size={14} />} />
                  <Metric title="Status" value={statusLabel(validation.importacao.status)} icon={<Filter size={14} />} />
                </div>
                <ErrorsTable errors={errors} onPage={(page) => importId() && void loadErrors(importId() as number, page)} />
              </div>
            )}

            {step === "importacao" && (
              <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                <SelectBox label="Estrategia" value={strategy} options={STRATEGIES} onChange={setStrategy} />
                {invalidLines > 0 && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <input type="checkbox" checked={confirmPartial} onChange={(event) => setConfirmPartial(event.target.checked)} />
                    Importar somente as linhas válidas
                  </label>
                )}
                <button type="button" onClick={() => void processImport()} disabled={busy || !validation || validation.resumo.linhasValidas === 0} className="premium-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50">
                  {busy ? <Loader2 className="animate-spin" size={14} /> : <UploadCloud size={14} />} Importar linhas válidas
                </button>
              </div>
            )}

            {processResult && step === "resultado" && <ProcessResult result={processResult} />}
          </section>

          <CatalogSection
            products={catalog}
            total={catalogTotal}
            page={catalogPage}
            totalPages={catalogPages}
            filters={catalogFilters}
            loading={state === "loading"}
            onFiltersChange={setCatalogFilters}
            onApply={() => applyCatalogFilters()}
            onClear={() => {
              setCatalogFilters({ q: "", sku: "", codigoBarras: "", categoria: "", marca: "", local: "", somenteDisponiveis: false });
              setCatalogPage(1);
              window.setTimeout(() => void reloadCatalog(1), 0);
            }}
            onPage={setCatalogPage}
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <ImportsSection
            imports={filteredImports}
            total={importsTotal}
            page={importsPage}
            totalPages={importPages}
            status={importStatus}
            format={importFormat}
            search={importSearch}
            selectedImport={selectedImport}
            errors={errors}
            busy={busy}
            onStatus={setImportStatus}
            onFormat={setImportFormat}
            onSearch={setImportSearch}
            onPage={setImportsPage}
            onOpen={(id) => void openImport(id)}
            onResume={(id) => void resumeImport(id)}
            onCancel={(id) => void cancelImport(id)}
            onClose={() => setSelectedImport(null)}
            onErrorsPage={(id, page) => void loadErrors(id, page)}
          />
          <QualitySection quality={quality} />
        </aside>
      </section>
    </div>
  );
}

function UploadSummary({ upload }: { upload: HubImportacaoUploadResponse }) {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-3">
      <div className="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <Info label="ID" value={upload.importacao.id} />
        <Info label="Arquivo" value={upload.nomeArquivo} />
        <Info label="Formato" value={upload.formato} />
        <Info label="Linhas estimadas" value={upload.totalLinhasEstimado} />
      </div>
      <PreviewTable rows={upload.primeirasLinhas} />
    </div>
  );
}

function ProcessResult({ result }: { result: HubImportacaoProcessamentoResponse }) {
  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-3">
      <p className="text-sm font-semibold text-emerald-100">
        {result.importacao.status === "CONCLUIDO" ? "Importação concluída com sucesso." : "Importação concluída com erros."}
      </p>
      <div className="grid gap-2 md:grid-cols-3">
        <Info label="Produtos criados" value={result.resultado.criados} />
        <Info label="Produtos atualizados" value={result.resultado.atualizados} />
        <Info label="Ignorados" value={result.resultado.ignorados} />
        <Info label="Estoques criados" value={result.resultado.estoquesCriados} />
        <Info label="Estoques atualizados" value={result.resultado.estoquesAtualizados} />
        <Info label="Preços atualizados" value={result.resultado.precosAtualizados} />
      </div>
    </div>
  );
}

function ImportsSection(props: {
  imports: HubImportacaoDados[];
  total: number;
  page: number;
  totalPages: number;
  status: string;
  format: string;
  search: string;
  selectedImport: HubImportacaoDados | null;
  errors: ImportErrors;
  busy: boolean;
  onStatus: (value: string) => void;
  onFormat: (value: string) => void;
  onSearch: (value: string) => void;
  onPage: (page: number) => void;
  onOpen: (id: number) => void;
  onResume: (id: number) => void;
  onCancel: (id: number) => void;
  onClose: () => void;
  onErrorsPage: (id: number, page: number) => void;
}) {
  return (
    <section className="premium-panel rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-slate-100">Importações recentes</h3>
      <div className="mt-3 grid gap-2">
        <input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Buscar arquivo" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-100" />
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={props.status} onChange={(event) => props.onStatus(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-100">
            {STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}
          </select>
          <select value={props.format} onChange={(event) => props.onFormat(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-100">
            {FORMAT_OPTIONS.map((format) => <option key={format}>{format}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {props.imports.length === 0 && <EmptyState title="Nenhuma importação encontrada" text="As importações enviadas pelo ADMIN aparecerão aqui." />}
        {props.imports.map((item) => (
          <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
            {importPrimaryAction(item.status) && (
              <div className="mb-3 rounded-xl border border-teal-300/20 bg-teal-300/[0.055] px-3 py-2 text-[11px] text-teal-50">
                {importActionHint(item.status)}
              </div>
            )}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-100" title={item.nomeArquivo}>{item.nomeArquivo}</p>
                <p className="mt-1 text-[11px] text-slate-500">{item.formato} · {formatDate(item.createdAt)}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
              <Info label="Total" value={item.totalLinhas} />
              <Info label="Válidas" value={item.linhasValidas} />
              <Info label="Erros" value={item.linhasComErro} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {importPrimaryAction(item.status) && (
                <button type="button" disabled={props.busy} onClick={() => props.onResume(item.id)} className="premium-button rounded-xl px-3 py-2 text-[11px] font-semibold disabled:opacity-50">
                  {importPrimaryAction(item.status)}
                </button>
              )}
              <button type="button" onClick={() => props.onOpen(item.id)} className="premium-ghost rounded-xl px-3 py-2 text-[11px] font-semibold text-slate-300">Detalhes</button>
              {!isFinalImportStatus(item.status) && (
                <button type="button" disabled={props.busy} onClick={() => props.onCancel(item.id)} className="premium-ghost rounded-xl px-3 py-2 text-[11px] font-semibold text-red-100 disabled:opacity-50">Cancelar</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Pagination page={props.page} totalPages={props.totalPages} total={props.total} onPage={props.onPage} />
      {props.selectedImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-semibold text-slate-100">Importação #{props.selectedImport.id}</h4>
                <p className="mt-1 text-xs text-slate-500">{props.selectedImport.nomeArquivo}</p>
              </div>
              <button type="button" onClick={props.onClose} className="premium-ghost rounded-xl p-2"><X size={15} /></button>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <Info label="Status" value={statusLabel(props.selectedImport.status)} />
              <Info label="Usuário" value={props.selectedImport.usuario?.nome ?? "-"} />
              <Info label="Integração" value={props.selectedImport.integracao?.nome ?? "-"} />
              <Info label="Criada em" value={formatDate(props.selectedImport.createdAt)} />
              <Info label="Finalizada em" value={formatDate(props.selectedImport.finalizadaEm)} />
              <Info label="Hash" value={props.selectedImport.hashArquivo ?? "-"} />
            </div>
            <pre className="mt-4 max-h-44 overflow-auto rounded-2xl border border-white/10 bg-black/30 p-3 text-[11px] text-slate-300">{JSON.stringify(props.selectedImport.mapeamento ?? {}, null, 2)}</pre>
            <ErrorsTable errors={props.errors} onPage={(page) => props.onErrorsPage(props.selectedImport?.id ?? 0, page)} />
          </div>
        </div>
      )}
    </section>
  );
}

function CatalogSection(props: {
  products: HubProdutoComercial[];
  total: number;
  page: number;
  totalPages: number;
  filters: { q: string; sku: string; codigoBarras: string; categoria: string; marca: string; local: string; somenteDisponiveis: boolean };
  loading: boolean;
  onFiltersChange: (value: { q: string; sku: string; codigoBarras: string; categoria: string; marca: string; local: string; somenteDisponiveis: boolean }) => void;
  onApply: () => void;
  onClear: () => void;
  onPage: (page: number) => void;
}) {
  function setFilter<K extends keyof typeof props.filters>(key: K, value: (typeof props.filters)[K]) {
    props.onFiltersChange({ ...props.filters, [key]: value });
  }
  return (
    <section className="premium-panel rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Produtos importados</h3>
          <p className="mt-1 text-xs text-slate-500">Consulta comercial unificada para atendimento.</p>
        </div>
        <span className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400">{props.total} produtos</span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <Input icon={<Search size={13} />} value={props.filters.q} placeholder="Nome, SKU, código ou marca" onChange={(value) => setFilter("q", value)} />
        <Input value={props.filters.sku} placeholder="SKU" onChange={(value) => setFilter("sku", value)} />
        <Input value={props.filters.codigoBarras} placeholder="Código de barras" onChange={(value) => setFilter("codigoBarras", value)} />
        <Input value={props.filters.categoria} placeholder="Categoria" onChange={(value) => setFilter("categoria", value)} />
        <Input value={props.filters.marca} placeholder="Marca" onChange={(value) => setFilter("marca", value)} />
        <Input value={props.filters.local} placeholder="Local" onChange={(value) => setFilter("local", value)} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300">
          <input type="checkbox" checked={props.filters.somenteDisponiveis} onChange={(event) => setFilter("somenteDisponiveis", event.target.checked)} />
          Somente disponíveis
        </label>
        <button type="button" onClick={props.onApply} className="premium-button inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"><Filter size={13} /> Filtrar</button>
        <button type="button" onClick={props.onClear} className="premium-ghost rounded-xl px-3 py-2 text-xs font-semibold text-slate-300">Limpar filtros</button>
      </div>
      <div className="mt-4 space-y-2">
        {props.loading && <div className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]" />}
        {!props.loading && props.products.length === 0 && <EmptyState title="Nenhum produto importado" text="Produtos externos importados por CSV ou XLSX aparecerão aqui." />}
        {props.products.map((product) => (
          <div key={product.idCanonico} className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100">{product.nome}</p>
                <p className="mt-1 text-xs text-slate-500">{product.sku || "Sem SKU"} · {product.codigoBarras || "Sem código"} · {product.categoria || "Sem categoria"}</p>
              </div>
              <StatusBadge status={availabilityLabel(product.disponibilidade)} />
            </div>
            <div className="mt-3 grid gap-2 text-xs md:grid-cols-4">
              <Info label="Disponível" value={`${formatQuantity(product.quantidadeDisponivelTotal)} ${product.unidade ?? ""}`.trim()} />
              <Info label="Preço atual" value={formatCurrency(product.precoAtualCentavos)} />
              <Info label="Promoção" value={product.emPromocao ? "Vigente" : "Não"} />
              <Info label="Origem" value={product.origem.integracaoNome ?? "-"} />
            </div>
            {product.avisos.length > 0 && <p className="mt-2 text-[11px] text-amber-200">{product.avisos.join(" · ")}</p>}
          </div>
        ))}
      </div>
      <Pagination page={props.page} totalPages={props.totalPages} total={props.total} onPage={props.onPage} />
    </section>
  );
}

function BlingSection({
  integrations,
  busy,
  message,
  lastSync,
  onConnect,
  onTest,
  onSync,
  onDisconnect,
}: {
  integrations: HubIntegracao[];
  busy: "connect" | "test" | "sync" | "disconnect" | null;
  message: string;
  lastSync: HubBlingSyncResponse | null;
  onConnect: () => void;
  onTest: (id: number) => void;
  onSync: (id: number) => void;
  onDisconnect: (id: number) => void;
}) {
  const active = integrations.find((item) => item.tipo === "BLING" && item.ativo && item.status === "ATIVA");
  const latest = active ?? integrations.find((item) => item.tipo === "BLING");
  const statusLabel = active ? "Conectado" : latest ? "Desconectado" : "Não conectado";

  return (
    <section className="premium-panel rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-100">Conectar Bling</h3>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
              Somente leitura
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
            Sincronize produtos, estoque, preços e formas de pagamento do Bling sem alterar dados no ERP.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!active && (
            <button type="button" onClick={onConnect} disabled={Boolean(busy)} className="premium-action inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold">
              {busy === "connect" ? <Loader2 className="animate-spin" size={14} /> : <PlugZap size={14} />} Conectar Bling
            </button>
          )}
          {active && (
            <>
              <button type="button" onClick={() => onTest(active.id)} disabled={Boolean(busy)} className="premium-ghost inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300">
                {busy === "test" ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Testar conexão
              </button>
              <button type="button" onClick={() => onSync(active.id)} disabled={Boolean(busy)} className="premium-action inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold">
                {busy === "sync" ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} Sincronizar agora
              </button>
              <button type="button" onClick={() => onDisconnect(active.id)} disabled={Boolean(busy)} className="premium-ghost inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300">
                {busy === "disconnect" ? <Loader2 className="animate-spin" size={14} /> : <Power size={14} />} Desconectar
              </button>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <Info label="Última sincronização" value={latest?.ultimaSincronizacaoEm ? dateTime(latest.ultimaSincronizacaoEm) : "-"} />
        <Info label="Último sucesso" value={latest?.ultimoSucessoEm ? dateTime(latest.ultimoSucessoEm) : "-"} />
        <Info label="Último erro" value={latest?.ultimoErroEm ? dateTime(latest.ultimoErroEm) : "-"} />
        <Info label="Credenciais" value={latest?.possuiCredenciais ? "Configuradas" : "Não configuradas"} />
      </div>
      {!active && (
        <Alert tone="info">Conector disponível para configuração. Sem credenciais reais, nenhuma chamada ao Bling será iniciada.</Alert>
      )}
      {message && <Alert tone={(message.toLowerCase().includes("não foi") || message.toLowerCase().includes("nao foi")) ? "error" : "success"}>{message}</Alert>}
      {lastSync && (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
          <span className="font-semibold text-slate-100">Última sincronização:</span>{" "}
          {lastSync.sincronizacao.itensRecebidos} recebidos, {lastSync.sincronizacao.itensProcessados} processados, {lastSync.sincronizacao.itensComErro} com erro.
        </div>
      )}
    </section>
  );
}

function QualitySection({ quality }: { quality: HubQualidadeDados | null }) {
  return (
    <section className="premium-panel rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-slate-100">Qualidade dos dados</h3>
      <div className="mt-3 grid gap-2">
        <Info label="Total de produtos" value={quality?.totalProdutos ?? 0} />
        <Info label="Ativos" value={quality?.produtosAtivos ?? 0} />
        <Info label="Inativos" value={quality?.produtosInativos ?? 0} />
        <Info label="Sem SKU" value={quality?.produtosSemSku ?? 0} />
        <Info label="Sem código de barras" value={quality?.produtosSemCodigoBarras ?? 0} />
        <Info label="Sem estoque" value={quality?.produtosSemEstoque ?? 0} />
        <Info label="Sem preço" value={quality?.produtosSemPreco ?? 0} />
        <Info label="Dados desatualizados" value={quality?.produtosComDadosDesatualizados ?? 0} />
        <Info label="Duplicidades" value={(quality?.duplicidadesDetectadas.sku.length ?? 0) + (quality?.duplicidadesDetectadas.codigoBarras.length ?? 0)} />
        <Info label="Última importação" value={quality?.ultimaImportacao ? `${quality.ultimaImportacao.nomeArquivo} · ${statusLabel(quality.ultimaImportacao.status)}` : "Nenhuma"} />
        <Info label="Última sincronização" value={formatDate(quality?.ultimaSincronizacao?.ultimaSincronizacaoEm)} />
      </div>
    </section>
  );
}

function ErrorsTable({ errors, onPage }: { errors: ImportErrors; onPage: (page: number) => void }) {
  if (errors.total === 0) return <EmptyState title="Nenhum erro por linha" text="Quando houver linhas inválidas, os erros sanitizados aparecerão aqui." />;
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="grid gap-2">
        {errors.data.map((error) => (
          <div key={error.id} className="grid gap-2 rounded-xl bg-white/[0.035] p-2 text-[11px] text-slate-300 md:grid-cols-[60px_120px_120px_minmax(0,1fr)]">
            <span>Linha {error.linha}</span>
            <span className="font-semibold text-slate-200">{error.campo}</span>
            <span>{error.codigo}</span>
            <span className="min-w-0 break-words">{error.mensagem}{error.valorSanitizado ? ` · ${error.valorSanitizado}` : ""}</span>
          </div>
        ))}
      </div>
      <Pagination page={errors.page} totalPages={Math.max(1, errors.totalPages)} total={errors.total} onPage={onPage} />
    </div>
  );
}

function PreviewTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = Object.keys(rows[0] ?? {}).slice(0, 6);
  if (!rows.length || !columns.length) return null;
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
      <table className="min-w-full text-left text-[11px] text-slate-300">
        <thead className="bg-white/[0.04] text-slate-400">
          <tr>{columns.map((column) => <th key={column} className="px-3 py-2 font-semibold">{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((row, index) => (
            <tr key={index} className="border-t border-white/5">
              {columns.map((column) => <td key={column} className="max-w-48 truncate px-3 py-2" title={String(row[column] ?? "")}>{String(row[column] ?? "-")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ title, value, icon }: { title: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        <span className="text-teal-100">{icon}</span>
        <span className="leading-snug">{title}</span>
      </div>
      <p className="mt-2 text-lg font-semibold text-slate-50">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xs font-semibold text-slate-200">{value ?? "-"}</p>
    </div>
  );
}

function Input({ value, placeholder, icon, onChange }: { value: string; placeholder: string; icon?: ReactNode; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-100">
      {icon}
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-600" />
    </label>
  );
}

function SelectBox<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <label className="grid gap-1 text-xs text-slate-400">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function Alert({ tone, children }: { tone: "error" | "warning" | "info" | "success"; children: ReactNode }) {
  const classes =
    tone === "error"
      ? "border-red-300/20 bg-red-500/10 text-red-100"
      : tone === "success"
        ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
        : tone === "info"
          ? "border-cyan-300/20 bg-cyan-500/10 text-cyan-100"
          : "border-amber-300/20 bg-amber-500/10 text-amber-100";
  return <div className={`mt-3 rounded-2xl border p-3 text-xs font-semibold ${classes}`}>{children}</div>;
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-center">
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{text}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-300">{statusLabel(status)}</span>;
}

function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <span>Total: {total} · Página {page} de {totalPages}</span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))} className="premium-ghost rounded-xl px-3 py-2 font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(Math.min(totalPages, page + 1))} className="premium-ghost rounded-xl px-3 py-2 font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-40">Próxima</button>
      </div>
    </div>
  );
}

function invertSuggestion(suggestion: Partial<Record<HubCanonicalField, string>>, columns: string[]) {
  const result: Record<string, HubCanonicalField | typeof IGNORE_FIELD> = {};
  columns.forEach((column) => { result[column] = IGNORE_FIELD; });
  Object.entries(suggestion).forEach(([field, column]) => {
    if (column && columns.includes(column)) result[column] = field as HubCanonicalField;
  });
  return result;
}

function buildFieldMapping(columnMapping: Record<string, HubCanonicalField | typeof IGNORE_FIELD>) {
  const result: Partial<Record<HubCanonicalField, string>> = {};
  Object.entries(columnMapping).forEach(([column, field]) => {
    if (field !== IGNORE_FIELD) result[field] = column;
  });
  return result;
}

function saveImportDraft(upload: HubImportacaoUploadResponse) {
  try {
    sessionStorage.setItem(`${IMPORT_DRAFT_PREFIX}${upload.importacao.id}`, JSON.stringify(upload));
  } catch {
    // A retomada fica indisponivel se o navegador bloquear sessionStorage.
  }
}

function loadImportDraft(id: number): HubImportacaoUploadResponse | null {
  try {
    const value = sessionStorage.getItem(`${IMPORT_DRAFT_PREFIX}${id}`);
    return value ? (JSON.parse(value) as HubImportacaoUploadResponse) : null;
  } catch {
    return null;
  }
}

function mappingResultFromImport(importacao: HubImportacaoDados): HubImportacaoMapeamentoResponse {
  return {
    importacao,
    previa: [],
    errosConfiguracao: [],
    avisos: [],
    linhasValidasEstimadas: importacao.linhasValidas,
    linhasInvalidasEstimadas: importacao.linhasComErro,
  };
}

function validationFromImport(importacao: HubImportacaoDados): HubImportacaoValidacaoResponse {
  return {
    importacao,
    resumo: {
      totalLinhas: importacao.totalLinhas,
      linhasValidas: importacao.linhasValidas,
      linhasComErro: importacao.linhasComErro,
      errosRegistrados: importacao.linhasComErro,
      avisos: [],
    },
  };
}

function isFinalImportStatus(status: string) {
  return ["CONCLUIDO", "CONCLUIDO_COM_ERROS", "FALHOU", "CANCELADO"].includes(status);
}

function importPrimaryAction(status: HubImportStatus | string) {
  if (status === "MAPEAMENTO_PENDENTE") return "Continuar mapeamento";
  if (status === "VALIDANDO") return "Validar arquivo";
  if (status === "PRONTO") return "Importar linhas válidas";
  return null;
}

function importActionHint(status: HubImportStatus | string) {
  if (status === "MAPEAMENTO_PENDENTE") return "Arquivo enviado. Falta mapear as colunas para continuar.";
  if (status === "VALIDANDO") return "Mapeamento salvo. Falta validar o arquivo.";
  if (status === "PRONTO") return "Arquivo validado. Falta importar as linhas válidas.";
  return "";
}

function workflowStatusText(step: StepKey, status?: HubImportStatus | string) {
  if (status === "CONCLUIDO") return "Concluído.";
  if (status === "CONCLUIDO_COM_ERROS") return "Concluído com erros.";
  if (step === "arquivo") return "Arquivo ainda não enviado.";
  if (step === "mapeamento") return "Arquivo enviado. Mapeamento pendente.";
  if (step === "validacao") return "Mapeamento salvo. Pronto para validar.";
  if (step === "importacao") return "Validado. Pronto para importar.";
  return "Resultado da importação.";
}

function primaryKeyLabel(mapping: Partial<Record<HubCanonicalField, string>>) {
  if (mapping.externalId) return "Código externo";
  if (mapping.sku) return "SKU";
  if (mapping.codigoBarras) return "Código de barras";
  return "Mapeie Código externo, SKU ou Código de barras";
}

function availabilityLabel(status: string) {
  return ({ EM_ESTOQUE: "Em estoque", SEM_ESTOQUE: "Sem estoque", INDISPONIVEL: "Indisponível", DESCONHECIDO: "Desconhecido" } as Record<string, string>)[status] ?? status;
}

function statusLabel(status?: string | null) {
  if (!status) return "-";
  return ({
    MAPEAMENTO_PENDENTE: "Mapeamento pendente",
    VALIDANDO: "Validando",
    PRONTO: "Pronto",
    PROCESSANDO: "Processando",
    CONCLUIDO: "Concluído",
    CONCLUIDO_COM_ERROS: "Concluído com erros",
    FALHOU: "Falhou",
    CANCELADO: "Cancelado",
    ENVIADO: "Enviado",
  } as Record<string, string>)[status] ?? status;
}

function stepLabel(step: StepKey) {
  return ({ arquivo: "Arquivo", mapeamento: "Mapeamento", validacao: "Validação", importacao: "Importação", resultado: "Resultado" })[step];
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

function formatQuantity(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "0";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(number);
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
