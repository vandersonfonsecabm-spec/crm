import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Filter,
  Loader2,
  MessageCircle,
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
  canAccessIntegrations,
  getAuthSession,
  iniciarConexaoBling,
  mapearImportacao,
  processarImportacao,
  simulateWhatsappMessage,
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
  type WhatsappSimulationCallResult,
} from "../../services/crmApi";
import DashboardMetricStrip from "./DashboardMetricStrip";
import {
  Button as UiButton,
  EmptyState as UiEmptyState,
  ErrorState as UiErrorState,
  Input as UiInput,
  LoadingState as UiLoadingState,
  Pagination as UiPagination,
  SectionHeader as UiSectionHeader,
  Select as UiSelect,
  StatusBadge as UiStatusBadge,
  Surface as UiSurface,
  Toolbar as UiToolbar,
} from "../ui";

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
const WHATSAPP_SMOKE_PHONE = "+5511999990001";
const WHATSAPP_SMOKE_NAME = "Contato Teste Simulador";

type StepKey = "arquivo" | "mapeamento" | "validacao" | "importacao" | "resultado";
type LoadState = "loading" | "success" | "error";
type IntegrationView = "overview" | "imports" | "catalog" | "simulator";
type ImportErrors = { data: HubErroImportacao[]; page: number; total: number; totalPages: number };
type WhatsappSmokeCall = WhatsappSimulationCallResult;
type WhatsappScenarioId = "saudacao" | "produto" | "preco" | "estoque" | "inexistente" | "vendedor";
type WhatsappScenario = {
  id: WhatsappScenarioId;
  title: string;
  description: string;
  message: string;
  externalBase: string;
  expectedIntent: string[];
  expectedNote: boolean;
  expectedFunnel: "unchanged" | "may-change";
  expectedFollowUp: boolean | "when-needed";
  requiresProduct: boolean;
  productName?: string;
  warning?: string;
};
type BlingSyncCounters = {
  produtosRecebidos?: number;
  produtosCriados?: number;
  produtosAtualizados?: number;
  estoquesRecebidos?: number;
  estoquesCriados?: number;
  estoquesAtualizados?: number;
  precosCriados?: number;
  precosAtualizados?: number;
  erros?: number;
};

export default function DashboardIntegrationsPanel({ initialBlingNotice = "" }: { initialBlingNotice?: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [activeView, setActiveView] = useState<IntegrationView>("overview");
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
  const [whatsappScenarioId, setWhatsappScenarioId] = useState<WhatsappScenarioId>("saudacao");
  const [whatsappExternalId, setWhatsappExternalId] = useState(() => createWhatsappExternalId("saudacao"));
  const [whatsappSmokeBusy, setWhatsappSmokeBusy] = useState<"first" | "repeat" | null>(null);
  const [whatsappSmokeError, setWhatsappSmokeError] = useState("");
  const [whatsappSmokeFirst, setWhatsappSmokeFirst] = useState<WhatsappSmokeCall | null>(null);
  const [whatsappSmokeRepeat, setWhatsappSmokeRepeat] = useState<WhatsappSmokeCall | null>(null);

  const importPages = Math.max(1, Math.ceil(importsTotal / IMPORT_LIMIT));
  const catalogPages = Math.max(1, Math.ceil(catalogTotal / CATALOG_LIMIT));
  const whatsappProduct = useMemo(() => selectWhatsappProduct(catalog), [catalog]);
  const whatsappScenarios = useMemo(() => buildWhatsappScenarios(whatsappProduct), [whatsappProduct]);
  const whatsappScenario = whatsappScenarios.find((scenario) => scenario.id === whatsappScenarioId) ?? whatsappScenarios[0];
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

  useEffect(() => {
    if (!initialBlingNotice) return;
    const timeout = window.setTimeout(() => {
      setBlingMessage(initialBlingNotice);
      void loadAll();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBlingNotice]);

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
      const result = await sincronizarIntegracao(integrationId, ["PRODUTOS", "ESTOQUE"]);
      setLastBlingSync(result);
      setBlingMessage(formatBlingSyncMessage(result));
      await Promise.all([loadAll(), reloadCatalog(), reloadQuality()]);
    } catch (error) {
      setBlingMessage(errorText(error, "Não foi possível sincronizar o Bling."));
    } finally {
      setBlingBusy(null);
    }
  }

  async function disconnectBling(integrationId: number) {
    if (!window.confirm("Desconectar o Bling? As sincronizações serão interrompidas até uma nova conexão.")) return;
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

  function selectWhatsappScenario(id: WhatsappScenarioId) {
    setWhatsappScenarioId(id);
    setWhatsappExternalId(createWhatsappExternalId(id));
    setWhatsappSmokeFirst(null);
    setWhatsappSmokeRepeat(null);
    setWhatsappSmokeError("");
  }

  function newWhatsappScenarioTest() {
    setWhatsappExternalId(createWhatsappExternalId(whatsappScenario.id));
    setWhatsappSmokeFirst(null);
    setWhatsappSmokeRepeat(null);
    setWhatsappSmokeError("");
  }

  async function runWhatsappSmoke(kind: "first" | "repeat") {
    if (!canAccessIntegrations(getAuthSession())) {
      setWhatsappSmokeError("Acesso negado para executar o simulador.");
      return;
    }
    if (whatsappScenario.requiresProduct && !whatsappProduct) {
      setWhatsappSmokeError("Nenhum produto ativo do catálogo está disponível para este cenário.");
      return;
    }
    setWhatsappSmokeBusy(kind);
    setWhatsappSmokeError("");
    if (kind === "first") setWhatsappSmokeRepeat(null);
    try {
      const result = await simulateWhatsappMessage({
        externalId: whatsappExternalId,
        telefone: WHATSAPP_SMOKE_PHONE,
        nome: WHATSAPP_SMOKE_NAME,
        mensagem: whatsappScenario.message,
      });
      if (kind === "first") setWhatsappSmokeFirst(result);
      else setWhatsappSmokeRepeat(result);
    } catch (error) {
      setWhatsappSmokeError(errorText(error, "Não foi possível executar o smoke test do simulador."));
    } finally {
      setWhatsappSmokeBusy(null);
    }
  }

  return (
    <div className="space-y-3 overflow-x-hidden">
      {toast && <div className="fixed right-5 top-5 z-50 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-4 py-3 text-xs font-semibold text-[var(--text-primary)] shadow-[var(--shadow-md)]">{toast}</div>}

      <UiSurface className="p-3">
        <UiToolbar>
          <div aria-label="Áreas de integrações" className="flex min-w-0 flex-wrap items-center gap-1 rounded-md bg-[var(--bg-muted)] p-1" role="tablist">
            <IntegrationTab active={activeView === "overview"} icon={<PlugZap size={13} />} label="Conexões" onClick={() => setActiveView("overview")} />
            <IntegrationTab active={activeView === "imports"} icon={<FileSpreadsheet size={13} />} label="Importações" onClick={() => setActiveView("imports")} />
            <IntegrationTab active={activeView === "catalog"} icon={<Database size={13} />} label="Catálogo" onClick={() => setActiveView("catalog")} />
            <IntegrationTab active={activeView === "simulator"} icon={<MessageCircle size={13} />} label="Simulador" onClick={() => setActiveView("simulator")} />
          </div>
          <UiButton leftIcon={<RefreshCw size={14} />} onClick={() => void loadAll()} size="sm" variant="secondary">
            Atualizar dados
          </UiButton>
        </UiToolbar>
      </UiSurface>

      {state === "loading" && (
        <UiSurface className="p-4">
          <UiLoadingState label="Carregando integrações" rows={4} />
        </UiSurface>
      )}

      {state === "error" && (
        <UiSurface>
          <UiErrorState
            description="A consulta foi interrompida sem alterar conexões ou dados externos."
            onRetry={() => void loadAll()}
            title={message || "Não foi possível carregar as integrações"}
          />
        </UiSurface>
      )}

      {state === "success" && activeView === "overview" && (
        <DashboardMetricStrip metrics={[
          { label: "Produtos no Hub", value: String(quality?.totalProdutos ?? 0), context: "Catálogo consolidado", icon: <Database size={15} /> },
          { label: "Produtos ativos", value: String(quality?.produtosAtivos ?? 0), context: "Disponíveis para consulta", icon: <CheckCircle2 size={15} />, tone: (quality?.produtosAtivos ?? 0) > 0 ? "success" : "default" },
          { label: "Sem estoque", value: String(quality?.produtosSemEstoque ?? 0), context: "Saldo indisponível", icon: <PackageSearch size={15} />, tone: (quality?.produtosSemEstoque ?? 0) > 0 ? "warning" : "default" },
          { label: "Dados desatualizados", value: String(quality?.produtosComDadosDesatualizados ?? 0), context: "Pedem revisão", icon: <AlertTriangle size={15} />, tone: (quality?.produtosComDadosDesatualizados ?? 0) > 0 ? "warning" : "default" },
        ]} />
      )}

      {state === "success" && activeView === "overview" && (
        <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
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
          <QualitySection quality={quality} />
        </div>
      )}

      {state === "success" && activeView === "simulator" && (
        <WhatsappSimulationSection
          scenarios={whatsappScenarios}
          scenario={whatsappScenario}
          scenarioId={whatsappScenarioId}
          externalId={whatsappExternalId}
          product={whatsappProduct}
          first={whatsappSmokeFirst}
          repeat={whatsappSmokeRepeat}
          busy={whatsappSmokeBusy}
          error={whatsappSmokeError}
          onScenarioChange={selectWhatsappScenario}
          onNewTest={newWhatsappScenarioTest}
          onRun={() => void runWhatsappSmoke("first")}
          onRepeat={() => void runWhatsappSmoke("repeat")}
        />
      )}

      {state === "success" && activeView === "imports" && (
      <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <UiSurface className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Importar arquivo</h3>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Fluxo real: upload, mapeamento, validação e processamento.</p>
              </div>
              <button type="button" onClick={resetFlow} className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
                <RotateCcw size={13} /> Nova importação
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-5">
              {(["arquivo", "mapeamento", "validacao", "importacao", "resultado"] as StepKey[]).map((key, index) => (
                <div key={key} className={`rounded-md border px-3 py-2 text-[11px] ${step === key ? "border-[var(--primary)] bg-[var(--surface-subtle)] text-[var(--primary)]" : "border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-muted)]"}`}>
                  <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{index + 1}</span>
                  <span className="ml-2 font-semibold">{stepLabel(key)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3 text-[11px] text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">Etapa atual: </span>
              {workflowStatusText(step, upload?.importacao.status ?? mappingResult?.importacao.status ?? validation?.importacao.status ?? processResult?.importacao.status)}
            </div>

            {message && <Alert tone="error">{message}</Alert>}

            {step === "arquivo" && (
              <div className="mt-4 space-y-3">
                <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--bg-muted)] p-5 text-center transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-subtle)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]">
                  <UploadCloud className="text-[var(--primary)]" size={24} />
                  <span className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Selecionar CSV ou XLSX</span>
                  <span className="mt-1 text-[11px] text-[var(--text-muted)]">Um arquivo por vez, até 10 MB.</span>
                  <input className="mt-3 block w-full max-w-md cursor-pointer rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)] file:mr-3 file:rounded file:border-0 file:bg-[var(--surface-subtle)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50" type="file" accept=".csv,.xlsx" onChange={onFileChange} disabled={busy} />
                </label>
                {selectedFile && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileSpreadsheet size={18} className="shrink-0 text-[var(--primary)]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{selectedFile.name}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{formatBytes(selectedFile.size)}</p>
                      </div>
                    </div>
                    <button aria-label="Remover arquivo" type="button" onClick={() => setSelectedFile(null)} disabled={busy} className="rounded-md p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)]"><X size={14} /></button>
                  </div>
                )}
                {fileError && <Alert tone="error">{fileError}</Alert>}
                {fileError.toLowerCase().includes("importado") && (
                  <button type="button" onClick={() => void sendFile(true)} disabled={busy} className="rounded-md border border-[var(--border-default)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-50">
                    Reprocessar mesmo arquivo com confirmacao
                  </button>
                )}
                <button type="button" onClick={() => void sendFile(false)} disabled={!selectedFile || busy} className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50">
                  {busy ? <Loader2 className="animate-spin" size={14} /> : <UploadCloud size={14} />} Enviar arquivo
                </button>
              </div>
            )}

            {upload && step !== "arquivo" && <UploadSummary upload={upload} />}

            {step === "mapeamento" && upload && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-2 lg:grid-cols-2">
                  {upload.colunasDetectadas.map((column) => (
                    <div key={column} className="grid gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3 sm:grid-cols-[minmax(0,1fr)_190px] sm:items-center">
                      <span className="truncate text-xs font-semibold text-[var(--text-secondary)]" title={column}>{column}</span>
                      <select value={mapping[column] ?? IGNORE_FIELD} onChange={(event) => setMapping((current) => ({ ...current, [column]: event.target.value as HubCanonicalField | typeof IGNORE_FIELD }))} className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)]">
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
                <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3 text-xs text-[var(--text-muted)]">
                  <span className="font-semibold text-[var(--text-primary)]">Chave principal: </span>
                  {primaryKeyLabel(buildFieldMapping(mapping))}
                </div>
                <button type="button" onClick={() => void saveMapping()} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
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
              <button type="button" onClick={() => void validateImport()} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
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
              <div className="mt-4 space-y-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
                <SelectBox label="Estrategia" value={strategy} options={STRATEGIES} onChange={setStrategy} />
                {invalidLines > 0 && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                    <input type="checkbox" checked={confirmPartial} onChange={(event) => setConfirmPartial(event.target.checked)} />
                    Importar somente as linhas válidas
                  </label>
                )}
                <button type="button" onClick={() => void processImport()} disabled={busy || !validation || validation.resumo.linhasValidas === 0} className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                  {busy ? <Loader2 className="animate-spin" size={14} /> : <UploadCloud size={14} />} Importar linhas válidas
                </button>
              </div>
            )}

            {processResult && step === "resultado" && <ProcessResult result={processResult} />}
          </UiSurface>

        </div>

        <aside className="min-w-0 space-y-3">
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
        </aside>
      </section>
      )}

      {state === "success" && activeView === "catalog" && (
        <section className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
          <CatalogSection
            products={catalog}
            total={catalogTotal}
            page={catalogPage}
            totalPages={catalogPages}
            filters={catalogFilters}
            loading={false}
            onFiltersChange={setCatalogFilters}
            onApply={() => applyCatalogFilters()}
            onClear={() => {
              setCatalogFilters({ q: "", sku: "", codigoBarras: "", categoria: "", marca: "", local: "", somenteDisponiveis: false });
              setCatalogPage(1);
              window.setTimeout(() => void reloadCatalog(1), 0);
            }}
            onPage={setCatalogPage}
          />
          <QualitySection quality={quality} />
        </section>
      )}
    </div>
  );
}

function IntegrationTab({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-selected={active}
      className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] ${
        active ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function UploadSummary({ upload }: { upload: HubImportacaoUploadResponse }) {
  return (
    <div className="mt-4 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
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
    <div className="mt-4 space-y-3 rounded-md border border-[color:rgba(36,122,82,0.28)] bg-[var(--surface-subtle)] p-3">
      <p className="text-sm font-semibold text-[var(--success)]">
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
    <UiSurface className="p-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Importações recentes</h3>
      <div className="mt-3 grid gap-2">
        <UiInput aria-label="Buscar arquivo" value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Buscar arquivo" />
        <div className="grid gap-2 sm:grid-cols-2">
          <UiSelect aria-label="Filtrar importações por status" value={props.status} onChange={(event) => props.onStatus(event.target.value)}>
            {STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}
          </UiSelect>
          <UiSelect aria-label="Filtrar importações por formato" value={props.format} onChange={(event) => props.onFormat(event.target.value)}>
            {FORMAT_OPTIONS.map((format) => <option key={format}>{format}</option>)}
          </UiSelect>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {props.imports.length === 0 && <EmptyState title="Nenhuma importação encontrada" text="As importações enviadas pelo ADMIN aparecerão aqui." />}
        {props.imports.map((item) => (
          <div key={item.id} className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
            {importPrimaryAction(item.status) && (
              <div className="mb-3 rounded-md border border-[color:rgba(36,122,82,0.28)] bg-[var(--surface-subtle)] px-3 py-2 text-[11px] text-[var(--primary)]">
                {importActionHint(item.status)}
              </div>
            )}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[var(--text-primary)]" title={item.nomeArquivo}>{item.nomeArquivo}</p>
                <p className="mt-1 text-[11px] tabular-nums text-[var(--text-muted)]">{item.formato} · {formatDate(item.createdAt)}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[var(--text-muted)]">
              <Info label="Total" value={item.totalLinhas} />
              <Info label="Válidas" value={item.linhasValidas} />
              <Info label="Erros" value={item.linhasComErro} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {importPrimaryAction(item.status) && (
                <button type="button" disabled={props.busy} onClick={() => props.onResume(item.id)} className="rounded-md bg-[var(--primary)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50">
                  {importPrimaryAction(item.status)}
                </button>
              )}
              <button type="button" onClick={() => props.onOpen(item.id)} className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)]">Detalhes</button>
              {!isFinalImportStatus(item.status) && (
                <button type="button" disabled={props.busy} onClick={() => props.onCancel(item.id)} className="rounded-md px-3 py-2 text-[11px] font-semibold text-[var(--danger)] disabled:opacity-50">Cancelar</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Pagination page={props.page} totalPages={props.totalPages} total={props.total} onPage={props.onPage} />
      {props.selectedImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow-md)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-semibold text-[var(--text-primary)]">Importação #{props.selectedImport.id}</h4>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{props.selectedImport.nomeArquivo}</p>
              </div>
              <button aria-label="Fechar detalhes da importação" type="button" onClick={props.onClose} className="rounded-md p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"><X size={15} /></button>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <Info label="Status" value={statusLabel(props.selectedImport.status)} />
              <Info label="Usuário" value={props.selectedImport.usuario?.nome ?? "-"} />
              <Info label="Integração" value={props.selectedImport.integracao?.nome ?? "-"} />
              <Info label="Criada em" value={formatDate(props.selectedImport.createdAt)} />
              <Info label="Finalizada em" value={formatDate(props.selectedImport.finalizadaEm)} />
              <Info label="Hash" value={props.selectedImport.hashArquivo ?? "-"} />
            </div>
            <pre className="mt-4 max-h-44 overflow-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3 text-[11px] text-[var(--text-secondary)]">{JSON.stringify(props.selectedImport.mapeamento ?? {}, null, 2)}</pre>
            <ErrorsTable errors={props.errors} onPage={(page) => props.onErrorsPage(props.selectedImport?.id ?? 0, page)} />
          </div>
        </div>
      )}
    </UiSurface>
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
    <UiSurface className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Produtos importados</h3>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Consulta comercial unificada para atendimento.</p>
        </div>
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{props.total} produtos</span>
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
        <label className="inline-flex items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">
          <input type="checkbox" checked={props.filters.somenteDisponiveis} onChange={(event) => setFilter("somenteDisponiveis", event.target.checked)} />
          Somente disponíveis
        </label>
        <button type="button" onClick={props.onApply} className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white"><Filter size={13} /> Filtrar</button>
        <button type="button" onClick={props.onClear} className="rounded-md px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]">Limpar filtros</button>
      </div>
      <div className="mt-4 space-y-2">
        {props.loading && <div className="h-28 animate-pulse rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)]" />}
        {!props.loading && props.products.length === 0 && <EmptyState title="Nenhum produto importado" text="Produtos externos importados por CSV ou XLSX aparecerão aqui." />}
        {props.products.map((product) => (
          <div key={product.idCanonico} className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{product.nome}</p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">{product.sku || "Sem SKU"} · {product.codigoBarras || "Sem código"} · {product.categoria || "Sem categoria"}</p>
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
    </UiSurface>
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
  const active = integrations.find((item) => item.tipo === "BLING" && item.ativo && item.possuiCredenciais && item.status !== "INATIVA");
  const latest = active ?? integrations.find((item) => item.tipo === "BLING");
  const statusLabel = active ? (active.status === "ERRO" ? "Conectado com erro" : "Conectado") : latest ? "Desconectado" : "Não conectado";
  const status = active ? (active.status === "ERRO" ? "erro" : "conectado") : latest ? "desconectado" : "indisponivel";

  return (
    <UiSurface className="min-w-0 overflow-hidden">
      <UiSectionHeader
        actions={(
          <div className="flex flex-wrap items-center gap-2">
          {!active && (
              <UiButton leftIcon={<PlugZap size={14} />} loading={busy === "connect"} onClick={onConnect} size="sm" variant="primary">Conectar Bling</UiButton>
          )}
          {active && (
            <>
                <UiButton disabled={Boolean(busy)} leftIcon={<CheckCircle2 size={14} />} loading={busy === "test"} onClick={() => onTest(active.id)} size="sm">Testar conexão</UiButton>
                <UiButton disabled={Boolean(busy)} leftIcon={<RefreshCw size={14} />} loading={busy === "sync"} onClick={() => onSync(active.id)} size="sm" variant="primary">Sincronizar agora</UiButton>
                <UiButton disabled={Boolean(busy)} leftIcon={<Power size={14} />} loading={busy === "disconnect"} onClick={() => onDisconnect(active.id)} size="sm">Desconectar</UiButton>
            </>
          )}
          </div>
        )}
        description="Produtos e estoque em modo de leitura. As ações de conexão respeitam as permissões administrativas existentes."
        icon={<PlugZap size={15} />}
        status={<UiStatusBadge label={statusLabel} status={status} />}
        title="Bling"
      />
      <div className="grid gap-2 px-4 py-3 md:grid-cols-4">
        <Info label="Última sincronização" value={latest?.ultimaSincronizacaoEm ? dateTime(latest.ultimaSincronizacaoEm) : "-"} />
        <Info label="Último sucesso" value={latest?.ultimoSucessoEm ? dateTime(latest.ultimoSucessoEm) : "-"} />
        <Info label="Último erro" value={latest?.ultimoErroEm ? dateTime(latest.ultimoErroEm) : "-"} />
        <Info label="Credenciais" value={latest?.possuiCredenciais ? "Configuradas" : "Não configuradas"} />
      </div>
      {!active && <div className="border-t border-[var(--border-default)] px-4 py-3"><Alert tone="info">Conector disponível para configuração. Sem credenciais reais, nenhuma chamada ao Bling será iniciada.</Alert></div>}
      {message && <div className="border-t border-[var(--border-default)] px-4 py-3"><Alert tone={(message.toLowerCase().includes("não foi") || message.toLowerCase().includes("nao foi")) ? "error" : "success"}>{message}</Alert></div>}
      {lastSync && (
        <div className="border-t border-[var(--border-default)] bg-[var(--bg-muted)] px-4 py-3 text-[11px] text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Última sincronização:</span>{" "}
          {formatBlingSyncSummary(lastSync)}
        </div>
      )}
    </UiSurface>
  );
}

function WhatsappSimulationSection({
  scenarios,
  scenario,
  scenarioId,
  externalId,
  product,
  first,
  repeat,
  busy,
  error,
  onScenarioChange,
  onNewTest,
  onRun,
  onRepeat,
}: {
  scenarios: WhatsappScenario[];
  scenario: WhatsappScenario;
  scenarioId: WhatsappScenarioId;
  externalId: string;
  product: HubProdutoComercial | null;
  first: WhatsappSmokeCall | null;
  repeat: WhatsappSmokeCall | null;
  busy: "first" | "repeat" | null;
  error: string;
  onScenarioChange: (id: WhatsappScenarioId) => void;
  onNewTest: () => void;
  onRun: () => void;
  onRepeat: () => void;
}) {
  const canRepeat = Boolean(first) && !busy;
  const canRun = !busy && (!scenario.requiresProduct || Boolean(product));
  return (
    <UiSurface className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Simulador WhatsApp</h3>
            <span className="rounded-full border border-[color:rgba(36,122,82,0.28)] px-2 py-0.5 text-[11px] font-semibold text-[var(--success)]">
              Sem envio real
            </span>
          </div>
          <p className="mt-0.5 max-w-2xl text-[11px] leading-4 text-[var(--text-muted)]">
            Execute uma simulação interna para validar o fluxo do catálogo e CRM. Nenhuma mensagem será enviada pelo WhatsApp.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onNewTest} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-md border border-[var(--border-default)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCw size={14} /> Novo teste deste cenário
          </button>
          <button type="button" onClick={onRun} disabled={!canRun} className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "first" ? <Loader2 className="animate-spin" size={14} /> : <PlugZap size={14} />} Executar cenário
          </button>
          {first && (
            <button type="button" onClick={onRepeat} disabled={!canRepeat} className="inline-flex items-center gap-2 rounded-md border border-[var(--border-default)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-50">
              {busy === "repeat" ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />} Repetir payload
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
          Cenário
          <select
            value={scenarioId}
            onChange={(event) => onScenarioChange(event.target.value as WhatsappScenarioId)}
            disabled={Boolean(busy)}
            className="mt-2 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-normal text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--control-ring)]"
          >
            {scenarios.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
        </label>
        <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">{scenario.title}</h4>
            {scenario.requiresProduct && <StatusBadge status={product ? "Produto real selecionado" : "Sem produto"} />}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{scenario.description}</p>
          {scenario.warning && <p className="mt-2 text-xs text-[var(--warning)]">{scenario.warning}</p>}
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-5">
        <Info label="External ID" value={externalId} />
        <Info label="Telefone fictício" value={maskSmokePhone(WHATSAPP_SMOKE_PHONE)} />
        <Info label="Mensagem" value={scenario.message} />
        <Info label="Produto usado" value={scenario.requiresProduct ? product?.nome ?? "Indisponível" : "Não aplicável"} />
        <Info label="Modo" value="Simulação interna" />
      </div>

      <Alert tone="info">Resposta apenas preparada — nenhuma mensagem será enviada.</Alert>
      {error && <Alert tone="error">{error}</Alert>}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {first && <WhatsappSimulationResult title="Primeira chamada" result={first} scenario={scenario} />}
        {repeat && <WhatsappSimulationResult title="Repetição do mesmo payload" result={repeat} scenario={scenario} original={first} />}
      </div>

      {repeat?.data.duplicada === true && (
        <Alert tone="success">Idempotência validada: a repetição do mesmo payload não criou novos efeitos.</Alert>
      )}
      {repeat?.data.duplicada === false && (
        <Alert tone="error">A repetição retornou duplicada=false. Não execute uma terceira chamada antes de revisar o resultado.</Alert>
      )}
    </UiSurface>
  );
}

function WhatsappSimulationResult({ title, result, scenario, original }: { title: string; result: WhatsappSmokeCall; scenario: WhatsappScenario; original?: WhatsappSmokeCall | null }) {
  const data = result.data;
  const checks = evaluateWhatsappScenario(result, scenario, original);
  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-[var(--text-secondary)]">{title}</h4>
        <StatusBadge status={data.duplicada ? "Duplicada" : "Processada"} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Info label="HTTP" value={result.httpStatus} />
        <Info label="Status" value={data.status} />
        <Info label="Duplicada" value={data.duplicada ? "Sim" : "Não"} />
        <Info label="Intenção" value={data.intencao?.tipo ?? "-"} />
        <Info label="Produto" value={data.produtoPrincipal?.nome ?? (scenario.id === "inexistente" ? "Não encontrado" : "-")} />
        <Info label="Preço" value={data.preco?.precoAtualCentavos === null || data.preco?.precoAtualCentavos === undefined ? "-" : formatCurrency(data.preco.precoAtualCentavos)} />
        <Info label="Estoque" value={data.estoque?.disponibilidade ? `${data.estoque.disponibilidade}${data.estoque.quantidadeDisponivelTotal === null || data.estoque.quantidadeDisponivelTotal === undefined ? "" : ` · ${formatQuantity(data.estoque.quantidadeDisponivelTotal)}`}` : "-"} />
        <Info label="Canal" value={data.canal ? `#${data.canal.id} · ${data.canal.status}` : "-"} />
        <Info label="Contato" value={data.contato ? `#${data.contato.id}` : "-"} />
        <Info label="Conversa" value={data.conversa ? `#${data.conversa.id} · ${data.conversa.status}` : "-"} />
        <Info label="Cliente" value={data.cliente ? `#${data.cliente.id} · ${data.cliente.criado ? "criado" : "reutilizado"}` : "-"} />
        <Info label="Nota" value={data.nota?.criada ? `#${data.nota.id}` : "Não criada"} />
        <Info label="Funil" value={`${data.funil?.etapaAnterior ?? "-"} → ${data.funil?.etapaAtual ?? "-"}${data.funil?.alterado ? " · alterado" : " · sem alteração"}`} />
        <Info label="Acompanhamento" value={data.acompanhamento?.criado ? `#${data.acompanhamento.id}` : data.acompanhamento?.reutilizado ? `#${data.acompanhamento.id} reutilizado` : "Não criado"} />
        <Info label="Saída" value={data.respostaPreparada ? `${data.respostaPreparada.status} · simulada` : "-"} />
      </div>
      {data.respostaPreparada?.texto && (
        <div className="mt-3 rounded-md border border-[color:rgba(36,122,82,0.28)] bg-[var(--surface-subtle)] p-3 text-xs leading-relaxed text-[var(--success)]">
          {data.respostaPreparada.texto}
        </div>
      )}
      <div className="mt-3 space-y-2">
        {checks.map((check) => (
          <div key={check.label} className="grid gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 text-xs md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_90px]">
            <span className="font-semibold text-[var(--text-secondary)]">{check.label}</span>
            <span className="text-[var(--text-muted)]">Esperado: {check.expected}</span>
            <span className="text-[var(--text-secondary)]">Obtido: {check.obtained}</span>
            <span className={check.approved ? "font-semibold text-[var(--success)]" : "font-semibold text-[var(--warning)]"}>{check.approved ? "Aprovado" : "Divergente"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QualitySection({ quality }: { quality: HubQualidadeDados | null }) {
  const checks = [
    { label: "Total de produtos", value: quality?.totalProdutos ?? 0, attention: false },
    { label: "Ativos", value: quality?.produtosAtivos ?? 0, attention: false },
    { label: "Inativos", value: quality?.produtosInativos ?? 0, attention: (quality?.produtosInativos ?? 0) > 0 },
    { label: "Sem SKU", value: quality?.produtosSemSku ?? 0, attention: (quality?.produtosSemSku ?? 0) > 0 },
    { label: "Sem código de barras", value: quality?.produtosSemCodigoBarras ?? 0, attention: (quality?.produtosSemCodigoBarras ?? 0) > 0 },
    { label: "Sem estoque", value: quality?.produtosSemEstoque ?? 0, attention: (quality?.produtosSemEstoque ?? 0) > 0 },
    { label: "Sem preço", value: quality?.produtosSemPreco ?? 0, attention: (quality?.produtosSemPreco ?? 0) > 0 },
    { label: "Dados desatualizados", value: quality?.produtosComDadosDesatualizados ?? 0, attention: (quality?.produtosComDadosDesatualizados ?? 0) > 0 },
    { label: "Duplicidades", value: (quality?.duplicidadesDetectadas.sku.length ?? 0) + (quality?.duplicidadesDetectadas.codigoBarras.length ?? 0), attention: (quality?.duplicidadesDetectadas.sku.length ?? 0) + (quality?.duplicidadesDetectadas.codigoBarras.length ?? 0) > 0 },
  ];

  return (
    <UiSurface className="min-w-0 overflow-hidden">
      <UiSectionHeader description="Pendências reais do catálogo consolidado." icon={<CheckCircle2 size={15} />} title="Qualidade dos dados" />
      <dl className="divide-y divide-[var(--border-default)]">
        {checks.map((check) => (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5" key={check.label}>
            <dt className="text-[11px] text-[var(--text-secondary)]">{check.label}</dt>
            <dd className={`text-[11px] font-semibold tabular-nums ${check.attention ? "text-[var(--warning)]" : "text-[var(--text-primary)]"}`}>{check.value}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-[var(--border-default)] bg-[var(--bg-muted)] px-4 py-3">
        <p className="text-[10px] text-[var(--text-muted)]">Última importação</p>
        <p className="mt-0.5 break-words text-[11px] font-medium text-[var(--text-secondary)]">
          {quality?.ultimaImportacao ? `${quality.ultimaImportacao.nomeArquivo} · ${statusLabel(quality.ultimaImportacao.status)}` : "Nenhuma"}
        </p>
        <p className="mt-2 text-[10px] text-[var(--text-muted)]">Última sincronização</p>
        <p className="mt-0.5 text-[11px] font-medium text-[var(--text-secondary)]">{formatDate(quality?.ultimaSincronizacao?.ultimaSincronizacaoEm)}</p>
      </div>
    </UiSurface>
  );
}

function ErrorsTable({ errors, onPage }: { errors: ImportErrors; onPage: (page: number) => void }) {
  if (errors.total === 0) return <EmptyState title="Nenhum erro por linha" text="Quando houver linhas inválidas, os erros sanitizados aparecerão aqui." />;
  return (
    <div className="mt-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
      <div className="grid gap-2">
        {errors.data.map((error) => (
          <div key={error.id} className="grid gap-2 rounded-md bg-[var(--bg-surface)] p-2 text-[11px] text-[var(--text-secondary)] md:grid-cols-[60px_120px_120px_minmax(0,1fr)]">
            <span>Linha {error.linha}</span>
            <span className="font-semibold text-[var(--text-primary)]">{error.campo}</span>
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
    <div className="mt-3 overflow-x-auto rounded-md border border-[var(--border-default)]">
      <table className="min-w-full text-left text-[11px] text-[var(--text-secondary)]">
        <thead className="bg-[var(--bg-muted)] text-[var(--text-muted)]">
          <tr>{columns.map((column) => <th key={column} className="px-3 py-2 font-semibold">{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((row, index) => (
            <tr key={index} className="border-t border-[var(--border-default)]">
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
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--text-muted)]">
        <span className="text-[var(--icon-default)]">{icon}</span>
        <span className="leading-snug">{title}</span>
      </div>
      <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2">
      <p className="text-[11px] font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 break-words text-[11px] font-semibold text-[var(--text-primary)]">{value ?? "-"}</p>
    </div>
  );
}

function Input({ value, placeholder, icon, onChange }: { value: string; placeholder: string; icon?: ReactNode; onChange: (value: string) => void }) {
  return (
    <div className="relative min-w-0">
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--icon-muted)]">{icon}</span>}
      <UiInput aria-label={placeholder} className={icon ? "pl-8" : ""} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
    </div>
  );
}

function SelectBox<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <UiSelect label={label} onChange={(event) => onChange(event.target.value as T)} value={value}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </UiSelect>
  );
}

function Alert({ tone, children }: { tone: "error" | "warning" | "info" | "success"; children: ReactNode }) {
  const classes =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : tone === "info"
          ? "border-sky-200 bg-sky-50 text-sky-800"
          : "border-amber-200 bg-amber-50 text-amber-800";
  return <div className={`mt-3 rounded-md border px-3 py-2.5 text-[11px] font-medium leading-5 ${classes}`}>{children}</div>;
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatBlingSyncMessage(sync: HubBlingSyncResponse) {
  const counters = readBlingSyncCounters(sync);
  if (sync.sincronizacao.status !== "CONCLUIDA") {
    return "Produtos sincronizados. Não foi possível atualizar todo o estoque.";
  }
  if (!counters) return "Produtos e estoque sincronizados com sucesso.";
  const produtos = count(counters.produtosCriados) + count(counters.produtosAtualizados);
  const saldos = count(counters.estoquesCriados) + count(counters.estoquesAtualizados);
  return `${produtos} produtos e ${saldos} saldos de estoque sincronizados com sucesso.`;
}

function formatBlingSyncSummary(sync: HubBlingSyncResponse) {
  const counters = readBlingSyncCounters(sync);
  if (!counters) {
    return `${sync.sincronizacao.itensRecebidos} recebidos, ${sync.sincronizacao.itensProcessados} processados, ${sync.sincronizacao.itensComErro} com erro.`;
  }
  const produtosProcessados = count(counters.produtosCriados) + count(counters.produtosAtualizados);
  const estoquesProcessados = count(counters.estoquesCriados) + count(counters.estoquesAtualizados);
  return `${count(counters.produtosRecebidos)} produtos recebidos, ${produtosProcessados} produtos processados, ${count(counters.estoquesRecebidos)} saldos recebidos, ${estoquesProcessados} saldos processados, ${sync.sincronizacao.itensComErro} com erro.`;
}

function readBlingSyncCounters(sync: HubBlingSyncResponse) {
  const resultado = sync.sincronizacao.metadados?.resultado;
  if (!resultado || typeof resultado !== "object" || Array.isArray(resultado)) return null;
  return resultado as BlingSyncCounters;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <UiEmptyState className="py-6" description={text} title={title} />;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLocaleLowerCase("pt-BR");
  const tone = normalized.includes("falhou") || normalized.includes("erro")
    ? "erro"
    : normalized.includes("concluído com erros") || normalized.includes("sem estoque")
      ? "alerta"
      : normalized.includes("concluído") || normalized.includes("em estoque")
        ? "sucesso"
        : normalized.includes("process") || normalized.includes("valid") || normalized.includes("pronto")
          ? "informacao"
          : "inativo";
  return <UiStatusBadge label={statusLabel(status)} status={tone} />;
}

function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  return <UiPagination className="mt-3 px-0 pb-0" onPageChange={onPage} page={page} total={total} totalPages={totalPages} />;
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

function selectWhatsappProduct(products: HubProdutoComercial[]) {
  return (
    products.find((product) => product.ativo && product.precoAtualCentavos !== null && product.precoAtualCentavos !== undefined && product.disponibilidade === "EM_ESTOQUE") ||
    products.find((product) => product.ativo && product.precoAtualCentavos !== null && product.precoAtualCentavos !== undefined && product.disponibilidade !== "DESCONHECIDO") ||
    products.find((product) => product.ativo && product.precoAtualCentavos !== null && product.precoAtualCentavos !== undefined) ||
    products.find((product) => product.ativo) ||
    null
  );
}

function buildWhatsappScenarios(product: HubProdutoComercial | null): WhatsappScenario[] {
  const productName = product?.nome || "produto do catálogo";
  return [
    {
      id: "saudacao",
      title: "Saudação",
      description: "Valida uma saudação simples, sem efeitos comerciais.",
      message: "Bom dia",
      externalBase: "saudacao",
      expectedIntent: ["SAUDACAO"],
      expectedNote: false,
      expectedFunnel: "unchanged",
      expectedFollowUp: false,
      requiresProduct: false,
    },
    {
      id: "produto",
      title: "Consulta de produto",
      description: "Pergunta se um produto real do catálogo está disponível.",
      message: `Tem ${productName}?`,
      externalBase: "consulta-produto",
      expectedIntent: ["CONSULTAR_DISPONIBILIDADE", "CONSULTAR_PRODUTO"],
      expectedNote: true,
      expectedFunnel: "may-change",
      expectedFollowUp: "when-needed",
      requiresProduct: true,
      productName: product?.nome,
    },
    {
      id: "preco",
      title: "Consulta de preço",
      description: "Consulta preço de um produto real sem inventar valor.",
      message: `Qual o preço de ${productName}?`,
      externalBase: "consulta-preco",
      expectedIntent: ["CONSULTAR_PRECO"],
      expectedNote: true,
      expectedFunnel: "may-change",
      expectedFollowUp: "when-needed",
      requiresProduct: true,
      productName: product?.nome,
    },
    {
      id: "estoque",
      title: "Consulta de estoque",
      description: "Consulta estoque de um produto real e preserva estoque desconhecido quando for o caso.",
      message: `Tem ${productName} em estoque?`,
      externalBase: "consulta-estoque",
      expectedIntent: ["CONSULTAR_ESTOQUE", "CONSULTAR_DISPONIBILIDADE"],
      expectedNote: true,
      expectedFunnel: "may-change",
      expectedFollowUp: "when-needed",
      requiresProduct: true,
      productName: product?.nome,
    },
    {
      id: "inexistente",
      title: "Produto inexistente",
      description: "Valida resposta segura para produto não encontrado.",
      message: "Tem o produto fictício Zeta Agro Teste 999?",
      externalBase: "produto-inexistente",
      expectedIntent: ["CONSULTAR_DISPONIBILIDADE", "CONSULTAR_PRODUTO"],
      expectedNote: true,
      expectedFunnel: "may-change",
      expectedFollowUp: true,
      requiresProduct: false,
      warning: "Produto propositalmente fictício para validar atendimento humano.",
    },
    {
      id: "vendedor",
      title: "Falar com vendedor",
      description: "Solicita atendimento humano sem envio real de mensagem.",
      message: "Quero falar com um vendedor",
      externalBase: "falar-vendedor",
      expectedIntent: ["FALAR_COM_VENDEDOR"],
      expectedNote: true,
      expectedFunnel: "may-change",
      expectedFollowUp: true,
      requiresProduct: false,
    },
  ];
}

function createWhatsappExternalId(scenarioId: WhatsappScenarioId) {
  return `admin-scenario-${scenarioId}-${Date.now()}-${randomSuffix()}`.slice(0, 150);
}

function randomSuffix() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0].toString(36);
  }
  return Math.random().toString(36).slice(2, 10);
}

function evaluateWhatsappScenario(result: WhatsappSmokeCall, scenario: WhatsappScenario, original?: WhatsappSmokeCall | null) {
  const data = result.data;
  const productExpected = scenario.id === "inexistente" ? "não encontrado" : scenario.requiresProduct ? "produto encontrado" : "não aplicável";
  const productApproved = scenario.id === "inexistente" ? !data.produtoPrincipal : !scenario.requiresProduct || Boolean(data.produtoPrincipal);
  const noteApproved = data.duplicada ? true : Boolean(data.nota?.criada) === scenario.expectedNote;
  const followUpApproved = data.duplicada || scenario.expectedFollowUp === "when-needed" ? true : Boolean(data.acompanhamento?.criado || data.acompanhamento?.reutilizado) === scenario.expectedFollowUp;
  const funnelApproved = scenario.expectedFunnel === "may-change" || !data.funil?.alterado;
  const sameIds = !original || (
    original.data.canal?.id === data.canal?.id &&
    original.data.contato?.id === data.contato?.id &&
    original.data.conversa?.id === data.conversa?.id &&
    original.data.cliente?.id === data.cliente?.id
  );

  return [
    { label: "Intenção", expected: scenario.expectedIntent.join(" ou "), obtained: data.intencao?.tipo || "-", approved: scenario.expectedIntent.includes(data.intencao?.tipo || "") || data.duplicada },
    { label: "Produto", expected: productExpected, obtained: data.produtoPrincipal?.nome || "não encontrado", approved: productApproved || data.duplicada },
    { label: "Nota", expected: scenario.expectedNote ? "criada" : "não criada", obtained: data.nota?.criada ? "criada" : "não criada", approved: noteApproved },
    { label: "Funil", expected: scenario.expectedFunnel === "may-change" ? "sem rebaixar estágio" : "sem alteração", obtained: data.funil?.alterado ? "alterado" : "sem alteração", approved: funnelApproved },
    { label: "Acompanhamento", expected: scenario.expectedFollowUp === "when-needed" ? "quando necessário" : scenario.expectedFollowUp ? "criado/reutilizado" : "não criado", obtained: data.acompanhamento?.criado ? "criado" : data.acompanhamento?.reutilizado ? "reutilizado" : "não criado", approved: followUpApproved },
    { label: "Saída", expected: "PREPARADA simulada", obtained: data.respostaPreparada ? `${data.respostaPreparada.status} simulada` : "-", approved: data.respostaPreparada?.status === "PREPARADA" },
    { label: "Idempotência", expected: original ? "mesmos IDs principais" : "primeira execução", obtained: original ? (sameIds ? "mesmos IDs" : "IDs divergentes") : (data.duplicada ? "duplicada" : "nova execução"), approved: original ? sameIds && data.duplicada : !data.duplicada },
  ];
}

function stepLabel(step: StepKey) {
  return ({ arquivo: "Arquivo", mapeamento: "Mapeamento", validacao: "Validação", importacao: "Importação", resultado: "Resultado" })[step];
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function maskSmokePhone(value: string) {
  return value.length > 4 ? `${"*".repeat(value.length - 4)}${value.slice(-4)}` : "***";
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
