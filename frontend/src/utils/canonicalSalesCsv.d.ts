import type { ApiPaginatedResponse, CanonicalSale } from "../services/crmApi";

export const CANONICAL_SALES_CSV_FILENAME: "vendas-canonicas.csv";
export const CANONICAL_SALES_CSV_MIME_TYPE: "text/csv;charset=utf-8;";
export const CANONICAL_SALES_EXPORT_PAGE_SIZE: 100;

export type CanonicalSalesPageFetcher = (params: { page: number; limit: number }) => Promise<ApiPaginatedResponse<CanonicalSale>>;

export type CsvDownloadDependencies = {
  documentRef?: Document;
  urlApi?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  BlobCtor?: typeof Blob;
  scheduleCleanup?: (callback: () => void, delayMs: number) => unknown;
  cleanupDelayMs?: number;
  filename?: string;
};

export function fetchAllCanonicalSales(
  fetchPage: CanonicalSalesPageFetcher,
  options?: { pageSize?: number },
): Promise<CanonicalSale[]>;

export function buildCanonicalSalesCsv(sales: CanonicalSale[]): string;

export function downloadCanonicalSalesCsv(
  csv: string,
  dependencies?: CsvDownloadDependencies,
): { filename: string; url: string };

export function toCsvCell(value: string | number | null | undefined): string;
