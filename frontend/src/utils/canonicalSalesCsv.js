export const CANONICAL_SALES_CSV_FILENAME = "vendas-canonicas.csv";
export const CANONICAL_SALES_CSV_MIME_TYPE = "text/csv;charset=utf-8;";
export const CANONICAL_SALES_EXPORT_PAGE_SIZE = 100;

const CANONICAL_SALES_CSV_HEADER = [
  "Venda",
  "Negócio",
  "Cliente",
  "Moeda",
  "Valor (BRL)",
  "Centavos",
  "Origem",
  "Status",
  "Fechado em",
  "Proposta",
  "Revisão",
];

export async function fetchAllCanonicalSales(fetchPage, { pageSize = CANONICAL_SALES_EXPORT_PAGE_SIZE } = {}) {
  if (typeof fetchPage !== "function") throw new TypeError("fetchPage deve ser uma função.");
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) throw new RangeError("pageSize deve ser um inteiro positivo.");

  const firstPage = await fetchPage({ page: 1, limit: pageSize });
  const totalPages = firstPage?.pagination?.totalPages;
  if (!Number.isSafeInteger(totalPages) || totalPages < 0) {
    throw new TypeError("A paginação de vendas canônicas é inválida.");
  }

  const sales = [...firstPage.data];
  for (let page = 2; page <= totalPages; page += 1) {
    const response = await fetchPage({ page, limit: pageSize });
    sales.push(...response.data);
  }
  return sales;
}

export function buildCanonicalSalesCsv(sales) {
  const rows = sales.map((sale) => {
    const totalCentavos = formatCanonicalCents(sale.totalCentavos);
    return [
      sale.id,
      sale.negocioId,
      sale.clienteId,
      sale.moeda,
      totalCentavos === null ? null : formatCanonicalBrl(totalCentavos),
      totalCentavos,
      sale.origem,
      sale.status,
      sale.fechadoEm,
      sale.propostaVencedora?.codigo ?? null,
      sale.revisao,
    ];
  });

  return [CANONICAL_SALES_CSV_HEADER, ...rows]
    .map((row) => row.map(toCsvCell).join(","))
    .join("\n");
}

export function downloadCanonicalSalesCsv(csv, dependencies = {}) {
  const documentRef = dependencies.documentRef ?? globalThis.document;
  const urlApi = dependencies.urlApi ?? globalThis.URL;
  const BlobCtor = dependencies.BlobCtor ?? globalThis.Blob;
  const scheduleCleanup = dependencies.scheduleCleanup ?? globalThis.setTimeout;
  const cleanupDelayMs = dependencies.cleanupDelayMs ?? 1_000;
  const filename = dependencies.filename ?? CANONICAL_SALES_CSV_FILENAME;

  if (!documentRef?.createElement || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL || !BlobCtor || typeof scheduleCleanup !== "function") {
    throw new Error("O navegador não oferece suporte à exportação CSV.");
  }
  if (!Number.isFinite(cleanupDelayMs) || cleanupDelayMs < 0) {
    throw new RangeError("cleanupDelayMs deve ser um número não negativo.");
  }

  const blob = new BlobCtor([csv], { type: CANONICAL_SALES_CSV_MIME_TYPE });
  const url = urlApi.createObjectURL(blob);
  const link = documentRef.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";

  const parent = documentRef.body;
  try {
    parent?.appendChild(link);
    link.click();
  } finally {
    if (typeof link.remove === "function") link.remove();
    else parent?.removeChild?.(link);
    scheduleCleanup(() => urlApi.revokeObjectURL(url), cleanupDelayMs);
  }

  return { filename, url };
}

export function toCsvCell(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  const formulaSafe = /^[=+\-@\t\r]/u.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

function formatCanonicalCents(value) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value)) throw new TypeError("totalCentavos deve ser um inteiro seguro.");
  return value;
}

function formatCanonicalBrl(value) {
  return (value / 100).toFixed(2).replace(".", ",");
}
