import { AlertTriangle, Boxes, CheckCircle2, Database, Package, RefreshCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ApiHttpError,
  canAccessIntegrations,
  fetchHubProdutosEstoque,
  fetchIntegracoes,
  getAuthSession,
  type HubProdutoEstoque,
} from "../../services/crmApi";
import { Button, EmptyState, ErrorState, Input, LoadingState, Pagination, SectionHeader, Select, Surface, Toolbar } from "../ui";
import DashboardMetricStrip from "./DashboardMetricStrip";

const PRODUCT_FETCH_LIMIT = 100;
const PRODUCT_PAGE_SIZE = 10;

type InventoryStatus = "idle" | "loading" | "success" | "error";
type StockFilter = "todos" | "disponivel" | "sem-estoque";
type SourceState = "unknown" | "connected" | "disconnected";

type InventoryErrorState = {
  title: string;
  description: string;
  canRetry: boolean;
};

export default function DashboardInventoryPanel({ onOpenIntegrations }: { onOpenIntegrations: () => void }) {
  const [products, setProducts] = useState<HubProdutoEstoque[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<InventoryStatus>("idle");
  const [errorState, setErrorState] = useState<InventoryErrorState | null>(null);
  const [sourceState, setSourceState] = useState<SourceState>("unknown");
  const [retryKey, setRetryKey] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [originFilter, setOriginFilter] = useState("Todos");
  const [unitFilter, setUnitFilter] = useState("Todos");
  const [stockFilter, setStockFilter] = useState<StockFilter>("todos");
  const canLoadInventory = canAccessIntegrations(getAuthSession());

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let ignore = false;

    async function loadInventory() {
      if (!canLoadInventory) {
        setStatus("error");
        setErrorState(inventoryErrorForStatus(403));
        return;
      }

      setStatus("loading");
      setErrorState(null);

      try {
        const response = await fetchHubProdutosEstoque({ page: 1, limit: PRODUCT_FETCH_LIMIT });
        if (ignore) return;

        setProducts(response.data);
        setTotal(response.pagination.total);

        if (response.pagination.total === 0) {
          try {
            const integrations = await fetchIntegracoes({ page: 1, limit: 100 });
            if (!ignore) {
              setSourceState(integrations.data.some((integration) => integration.ativo && integration.status === "ATIVA") ? "connected" : "disconnected");
            }
          } catch {
            if (!ignore) setSourceState("unknown");
          }
        } else {
          setSourceState("connected");
        }

        if (!ignore) setStatus("success");
      } catch (error) {
        if (ignore) return;
        if (import.meta.env.DEV) console.error("Falha ao carregar estoque canônico", error);
        setErrorState(toInventoryErrorState(error));
        setStatus("error");
      }
    }

    void loadInventory();

    return () => {
      ignore = true;
    };
  }, [canLoadInventory, retryKey]);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        if (originFilter !== "Todos" && integratedOriginLabel(product) !== originFilter) return false;
        if (unitFilter !== "Todos" && integratedUnit(product) !== unitFilter) return false;

        const quantity = integratedQuantity(product);
        if (stockFilter === "disponivel" && quantity <= 0) return false;
        if (stockFilter === "sem-estoque" && quantity > 0) return false;

        const query = normalizeSearchText(debouncedSearch);
        if (!query) return true;

        return normalizeSearchText(
          [
            product.produto.nome,
            product.produto.sku,
            product.produto.codigoBarras,
            product.produto.categoria,
            integratedOriginLabel(product),
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(query);
      }),
    [debouncedSearch, originFilter, products, stockFilter, unitFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleProducts = filteredProducts.slice((safePage - 1) * PRODUCT_PAGE_SIZE, safePage * PRODUCT_PAGE_SIZE);
  const originOptions = useMemo(() => ["Todos", ...uniqueValues(products.map(integratedOriginLabel))], [products]);
  const unitOptions = useMemo(() => ["Todos", ...uniqueValues(products.map(integratedUnit).filter(Boolean))], [products]);
  const hasFilters = Boolean(debouncedSearch) || originFilter !== "Todos" || unitFilter !== "Todos" || stockFilter !== "todos";
  const partialCatalog = total > products.length;

  const metrics = useMemo(() => {
    const available = products.filter((product) => integratedQuantity(product) > 0).length;
    const empty = products.filter((product) => integratedQuantity(product) <= 0).length;
    const stale = products.filter((product) => product.possivelmenteDesatualizado).length;
    const sampleContext = partialCatalog ? `nos ${products.length} itens carregados` : "no catálogo canônico";

    return [
      {
        label: "Produtos integrados",
        value: String(total),
        context: "isolados por empresa",
        icon: <Package size={15} />,
        tone: "info" as const,
      },
      {
        label: "Com estoque",
        value: String(available),
        context: sampleContext,
        icon: <CheckCircle2 size={15} />,
        tone: "success" as const,
      },
      {
        label: "Sem estoque",
        value: String(empty),
        context: sampleContext,
        icon: <Boxes size={15} />,
        tone: empty > 0 ? ("danger" as const) : ("default" as const),
      },
      {
        label: "Dados desatualizados",
        value: String(stale),
        context: sampleContext,
        icon: <AlertTriangle size={15} />,
        tone: stale > 0 ? ("warning" as const) : ("default" as const),
      },
    ];
  }, [partialCatalog, products, total]);

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setOriginFilter("Todos");
    setUnitFilter("Todos");
    setStockFilter("todos");
    setPage(1);
  }

  if (status === "error" && errorState) {
    return (
      <Surface>
        <ErrorState
          description={errorState.description}
          onRetry={errorState.canRetry ? () => setRetryKey((current) => current + 1) : undefined}
          title={errorState.title}
        />
      </Surface>
    );
  }

  return (
    <section className="space-y-4" aria-busy={status === "loading"}>
      <DashboardMetricStrip metrics={metrics} />

      <Surface>
        <SectionHeader
          description="Catálogo canônico de produtos e saldos, exibido somente para leitura."
          icon={<Database size={15} />}
          status={<span className="text-[11px] text-[var(--text-muted)]">{total} {total === 1 ? "registro" : "registros"}</span>}
          title="Estoque integrado"
        />

        <Toolbar className="border-b border-[var(--border-default)] px-4 py-3">
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_150px_140px_150px]">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--icon-muted)]" size={14} />
              <Input
                aria-label="Buscar produto, SKU, código ou origem"
                className="pl-9"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar produto, SKU, código ou origem"
                value={search}
              />
            </div>

            <Select
              aria-label="Filtrar por origem"
              onChange={(event) => {
                setOriginFilter(event.target.value);
                setPage(1);
              }}
              value={originFilter}
            >
              {originOptions.map((origin) => <option key={origin} value={origin}>{origin === "Todos" ? "Todas as origens" : origin}</option>)}
            </Select>

            <Select
              aria-label="Filtrar por unidade"
              onChange={(event) => {
                setUnitFilter(event.target.value);
                setPage(1);
              }}
              value={unitFilter}
            >
              {unitOptions.map((unit) => <option key={unit} value={unit}>{unit === "Todos" ? "Todas as unidades" : unit}</option>)}
            </Select>

            <Select
              aria-label="Filtrar por saldo"
              onChange={(event) => {
                setStockFilter(event.target.value as StockFilter);
                setPage(1);
              }}
              value={stockFilter}
            >
              <option value="todos">Todos os saldos</option>
              <option value="disponivel">Com estoque</option>
              <option value="sem-estoque">Sem estoque</option>
            </Select>
          </div>

          <Button disabled={!hasFilters} onClick={clearFilters} size="sm" variant="ghost">Limpar</Button>
        </Toolbar>

        {status === "loading" && <LoadingState className="p-4" label="Carregando produtos do estoque" rows={6} />}

        {status === "success" && products.length === 0 && (
          <EmptyState
            action={
              sourceState === "disconnected"
                ? <Button onClick={onOpenIntegrations} size="sm" variant="secondary">Abrir Integrações</Button>
                : undefined
            }
            description={
              sourceState === "disconnected"
                ? "Nenhuma integração de produtos está conectada. A conexão pode ser configurada na área de Integrações."
                : "O catálogo canônico ainda não possui produtos para esta empresa."
            }
            icon={<Package size={18} />}
            title={sourceState === "disconnected" ? "Nenhuma fonte de produtos conectada" : "Nenhum produto foi encontrado"}
          />
        )}

        {status === "success" && products.length > 0 && filteredProducts.length === 0 && (
          <EmptyState
            action={<Button onClick={clearFilters} size="sm" variant="secondary">Limpar filtros</Button>}
            description="Revise a busca ou remova os filtros para voltar ao catálogo completo."
            title="Nenhum produto corresponde aos filtros"
          />
        )}

        {status === "success" && visibleProducts.length > 0 && (
          <>
            {partialCatalog && (
              <div className="flex items-center gap-2 border-b border-[var(--border-default)] bg-[var(--bg-muted)] px-4 py-2 text-[11px] text-[var(--text-secondary)]">
                <RefreshCcw size={13} />
                Exibindo os primeiros {products.length} de {total} produtos retornados pela fonte canônica.
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
                <thead className="bg-[var(--bg-muted)] text-[11px] font-medium text-[var(--text-secondary)]">
                  <tr className="border-b border-[var(--border-default)]">
                    <th className="w-[26%] px-4 py-2.5 font-medium">Produto</th>
                    <th className="w-[14%] px-3 py-2.5 font-medium">SKU</th>
                    <th className="w-[12%] px-3 py-2.5 text-right font-medium">Preço</th>
                    <th className="w-[8%] px-3 py-2.5 font-medium">Unidade</th>
                    <th className="w-[12%] px-3 py-2.5 text-right font-medium">Saldo</th>
                    <th className="w-[10%] px-3 py-2.5 font-medium">Origem</th>
                    <th className="w-[9%] px-3 py-2.5 font-medium">Status</th>
                    <th className="w-[9%] px-3 py-2.5 font-medium">Atualização</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {visibleProducts.map((product) => <InventoryRow key={integratedProductKey(product)} product={product} />)}
                </tbody>
              </table>
            </div>
            <Pagination
              itemLabel="produtos"
              onPageChange={setPage}
              page={safePage}
              total={filteredProducts.length}
              totalPages={totalPages}
              visibleCount={visibleProducts.length}
            />
          </>
        )}
      </Surface>
    </section>
  );
}

function InventoryRow({ product }: { product: HubProdutoEstoque }) {
  const unit = integratedUnit(product);
  const status = integratedStockStatus(product);
  const updatedAt = integratedUpdatedAt(product);

  return (
    <tr className="bg-[var(--bg-surface)] transition-colors hover:bg-[var(--bg-muted)]">
      <td className="px-4 py-3 align-middle">
        <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{product.produto.nome}</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{product.produto.categoria || "Sem categoria"}</p>
      </td>
      <td className="px-3 py-3 align-middle text-[11px] font-medium text-[var(--text-secondary)]">{product.produto.sku || "Sem SKU"}</td>
      <td className="px-3 py-3 text-right align-middle text-xs font-semibold tabular-nums text-[var(--text-primary)]">{formatOptionalCurrency(integratedPrice(product))}</td>
      <td className="px-3 py-3 align-middle text-[11px] text-[var(--text-secondary)]">{unit || "Não informada"}</td>
      <td className={`px-3 py-3 text-right align-middle text-xs font-semibold tabular-nums ${status.tone === "success" ? "text-[var(--success)]" : status.tone === "danger" ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
        {formatIntegratedStock(product)}
      </td>
      <td className="px-3 py-3 align-middle text-[11px] font-medium text-[var(--info)]">{integratedOriginLabel(product)}</td>
      <td className="px-3 py-3 align-middle">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${status.className}`}>{status.label}</span>
      </td>
      <td className="px-3 py-3 align-middle">
        <p className="text-[11px] text-[var(--text-muted)]">{formatOptionalDateTime(updatedAt)}</p>
        {product.possivelmenteDesatualizado && <p className="mt-0.5 text-[10px] font-medium text-[var(--warning)]">Desatualizado</p>}
      </td>
    </tr>
  );
}

function toInventoryErrorState(error: unknown): InventoryErrorState {
  if (error instanceof ApiHttpError) return inventoryErrorForStatus(error.status);
  return inventoryErrorForStatus(0);
}

function inventoryErrorForStatus(status: number): InventoryErrorState {
  if (status === 401) {
    return { title: "Sessão expirada", description: "Sua sessão expirou. Entre novamente para continuar.", canRetry: false };
  }
  if (status === 403) {
    return { title: "Acesso ao estoque não permitido", description: "Você não possui permissão para visualizar o estoque.", canRetry: false };
  }
  if (status === 410) {
    return { title: "Fonte de estoque indisponível", description: "Esta fonte de estoque não está mais disponível.", canRetry: false };
  }
  if (status >= 500) {
    return { title: "Erro interno no estoque", description: "Não foi possível carregar os produtos devido a um erro interno.", canRetry: true };
  }
  if (status === 0) {
    return { title: "Servidor indisponível", description: "Não foi possível se comunicar com o servidor.", canRetry: true };
  }
  return { title: "Não foi possível carregar o estoque", description: "A consulta foi interrompida sem alterar dados externos.", canRetry: false };
}

function integratedProductKey(product: HubProdutoEstoque) {
  return product.produto.id || product.produto.externalId || product.produto.sku || product.produto.nome;
}

function integratedUnit(product: HubProdutoEstoque) {
  return product.produto.unidade?.trim().toUpperCase() || "";
}

function integratedPrice(product: HubProdutoEstoque) {
  const defaultPrice = product.precos.find((price) => normalizeSearchText(price.tabela || "") === "padrao") ?? product.precos[0];
  return defaultPrice?.precoPromocionalCentavos ?? defaultPrice?.precoCentavos ?? null;
}

function integratedQuantity(product: HubProdutoEstoque) {
  return product.estoques.reduce((sum, stock) => sum + decimalNumber(stock.disponivel ?? stock.quantidade), 0);
}

function formatIntegratedStock(product: HubProdutoEstoque) {
  const unit = integratedUnit(product);
  return `${formatDecimal(integratedQuantity(product))} ${unit}`.trim();
}

function integratedOriginLabel(product: HubProdutoEstoque) {
  const type = product.origem?.tipo?.trim().toUpperCase();
  if (type === "BLING") return "Bling";
  if (type === "CSV") return "CSV";
  if (type === "XLSX") return "XLSX";
  return product.origem?.integracaoNome?.trim() || "Integração";
}

function integratedUpdatedAt(product: HubProdutoEstoque) {
  return (
    product.atualizadoEm ||
    product.origem?.ultimoSucessoEm ||
    product.origem?.ultimaSincronizacaoEm ||
    product.estoques[0]?.sincronizadoEm ||
    product.precos[0]?.sincronizadoEm ||
    null
  );
}

function integratedStockStatus(product: HubProdutoEstoque) {
  if (!product.produto.ativo) {
    return { label: "Inativo", tone: "neutral" as const, className: "border-[var(--border-default)] text-[var(--text-muted)]" };
  }
  if (integratedQuantity(product) <= 0) {
    return { label: "Sem estoque", tone: "danger" as const, className: "border-[color:rgba(179,58,69,0.28)] text-[var(--danger)]" };
  }
  return { label: "Disponível", tone: "success" as const, className: "border-[color:rgba(36,122,82,0.28)] text-[var(--success)]" };
}

function formatOptionalCurrency(cents: number | null | undefined) {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "Não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatOptionalDateTime(value?: string | null) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);
}

function decimalNumber(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, "pt-BR", { sensitivity: "base" }));
}

function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
