import { apiClient } from "./client";

export interface Entry {
  id: number;
  challan_no: string;
  vehicle_no: string;
  party_name?: string | null;
  product: string;
  destination: string;
  destination_lat?: number | null;
  destination_lng?: number | null;
  quantity: string | number;
  unit_price: string | number;
  gst_type: string;
  gst_rate?: string | number | null;
  subtotal: string | number;
  gst_amount: string | number;
  total_price: string | number;
  created_at: string;
  updated_at: string;
  created_by?: number;
  updated_by?: number;
  challan_series?: string;
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
  party_name?: string;
}

export interface EntryFormData {
  challan_no: string;
  challan_series?: string;
  vehicle_no: string;
  party_name?: string | null;
  product: string;
  destination: string;
  destination_lat?: number | null;
  destination_lng?: number | null;
  quantity: number | string;
  unit_price: number | string;
  gst_type?: string;
  gst_rate?: number | string | null;
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
  const allowedKeys = ["q", "date_from", "date_to", "product", "vehicle_no", "challan_no", "destination", "party_name"];
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
    gst_rate: data.gst_rate !== undefined && data.gst_rate !== null && data.gst_rate !== "" ? String(data.gst_rate) : null,
  });
  return response.data;
}

export async function updateEntryApi(id: number, data: Partial<EntryFormData>): Promise<Entry> {
  const payload: Record<string, any> = { ...data };
  if (data.quantity !== undefined) payload.quantity = String(data.quantity);
  if (data.unit_price !== undefined) payload.unit_price = String(data.unit_price);
  if (data.gst_rate !== undefined) {
    payload.gst_rate = data.gst_rate !== null && data.gst_rate !== "" ? String(data.gst_rate) : null;
  }

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

export async function getVehicleSuggestionsApi(q: string): Promise<string[]> {
  const response = await apiClient.get<string[]>("/entries/vehicle-suggestions", {
    params: { q },
  });
  return response.data;
}

export interface NextChallanNoResponse {
  series_type: string;
  next_challan_no: string;
  source: string;
}

export async function fetchNextChallanNoApi(params: {
  series_type?: "own" | "party";
  party_id?: number;
  party_name?: string;
}): Promise<NextChallanNoResponse> {
  const response = await apiClient.get<NextChallanNoResponse>("/entries/next-challan-no", {
    params,
  });
  return response.data;
}

export interface ChallanSettings {
  wi_initial_challan_no: string;
}

export async function fetchChallanSettingsApi(): Promise<ChallanSettings> {
  const response = await apiClient.get<ChallanSettings>("/settings/challan-series");
  return response.data;
}

export async function updateChallanSettingsApi(
  wi_initial_challan_no: string
): Promise<ChallanSettings> {
  const response = await apiClient.put<ChallanSettings>("/settings/challan-series", {
    wi_initial_challan_no,
  });
  return response.data;
}

/** Record a challan share event in the backend audit trail. Fire-and-forget: never throws. */
export async function recordChallanShareApi(
  entryId: number,
  channel: "whatsapp_buyer" | "whatsapp_company" | "pdf_share",
  recipientPhone?: string
): Promise<void> {
  try {
    await apiClient.post(`/entries/${entryId}/share`, {
      channel,
      recipient_phone: recipientPhone ?? null,
    });
  } catch {
    // audit failures are non-fatal
  }
}
