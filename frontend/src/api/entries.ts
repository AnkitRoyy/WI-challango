import { apiClient } from "./client";

export interface Entry {
  id: number;
  serial_no: string;
  challan_no: string;
  vehicle_no: string;
  product: string;
  destination: string;
  destination_lat?: number | null;
  destination_lng?: number | null;
  quantity: string | number;
  unit_price: string | number;
  total_price: string | number;
  created_at: string;
  updated_at: string;
  created_by?: number;
  updated_by?: number;
  warning?: string | null;
}

export interface EntryListResponse {
  items: Entry[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface EntrySummaryResponse {
  count: number;
  sum_total_price: string | number;
  sum_quantity: string | number;
}

export interface EntryFilters {
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  q?: string;
  date_from?: string;
  date_to?: string;
  product?: string;
  vehicle_no?: string;
  challan_no?: string;
  destination?: string;
}

export interface EntryFormData {
  serial_no: string;
  challan_no: string;
  vehicle_no: string;
  product: string;
  destination: string;
  destination_lat?: number | null;
  destination_lng?: number | null;
  quantity: number | string;
  unit_price: number | string;
}

export async function fetchEntries(filters: EntryFilters): Promise<EntryListResponse> {
  const cleanParams: Record<string, any> = {};
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      cleanParams[k] = v;
    }
  });

  const response = await apiClient.get<EntryListResponse>("/entries", {
    params: cleanParams,
  });
  return response.data;
}

export async function fetchEntriesSummary(filters: EntryFilters): Promise<EntrySummaryResponse> {
  const cleanParams: Record<string, any> = {};
  const allowedKeys = ["q", "date_from", "date_to", "product", "vehicle_no", "challan_no", "destination"];
  allowedKeys.forEach((k) => {
    const val = (filters as any)[k];
    if (val !== undefined && val !== null && val !== "") {
      cleanParams[k] = val;
    }
  });

  const response = await apiClient.get<EntrySummaryResponse>("/entries/summary", {
    params: cleanParams,
  });
  return response.data;
}

export async function createEntryApi(data: EntryFormData): Promise<Entry> {
  const response = await apiClient.post<Entry>("/entries", {
    ...data,
    quantity: String(data.quantity),
    unit_price: String(data.unit_price),
  });
  return response.data;
}

export async function updateEntryApi(id: number, data: Partial<EntryFormData>): Promise<Entry> {
  const payload: Record<string, any> = { ...data };
  if (data.quantity !== undefined) payload.quantity = String(data.quantity);
  if (data.unit_price !== undefined) payload.unit_price = String(data.unit_price);

  const response = await apiClient.patch<Entry>(`/entries/${id}`, payload);
  return response.data;
}

export async function deleteEntryApi(id: number): Promise<{ detail: string; id: number }> {
  const response = await apiClient.delete<{ detail: string; id: number }>(`/entries/${id}`);
  return response.data;
}

export async function exportEntriesApi(
  filters: EntryFilters,
  format: "xlsx" | "csv"
): Promise<{ blob: Blob; filename: string }> {
  const cleanParams: Record<string, any> = { format };
  Object.entries(filters).forEach(([k, v]) => {
    if (k !== "page" && k !== "page_size" && v !== undefined && v !== null && v !== "") {
      cleanParams[k] = v;
    }
  });

  const response = await apiClient.get("/entries/export", {
    params: cleanParams,
    responseType: "blob",
  });

  // Extract filename from Content-Disposition header if available
  const disposition = response.headers["content-disposition"] || "";
  let filename = `entries_export.${format}`;
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/);
  if (filenameMatch && filenameMatch[1]) {
    filename = filenameMatch[1];
  }

  return { blob: response.data, filename };
}
