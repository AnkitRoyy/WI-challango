import { apiClient } from "./client";

export interface Party {
  id: number;
  name: string;
  trade_name?: string | null;
  legal_name?: string | null;
  gst_number?: string | null;
  address?: string | null;
  state?: string | null;
  phone?: string | null;
  initial_challan_no?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: number | null;
  updated_by?: number | null;
}

export interface PartyCreateInput {
  name: string;
  trade_name?: string | null;
  legal_name?: string | null;
  gst_number?: string | null;
  address?: string | null;
  state?: string | null;
  phone?: string | null;
  initial_challan_no: string;
}

export interface PartyUpdateInput {
  name?: string;
  trade_name?: string | null;
  legal_name?: string | null;
  gst_number?: string | null;
  address?: string | null;
  state?: string | null;
  phone?: string | null;
  initial_challan_no?: string | null;
}

export interface GSTLookupResult {
  gstin: string;
  legal_name: string;
  trade_name?: string | null;
  address?: string | null;
  state?: string | null;
  gst_status?: string | null;
}

export async function fetchPartiesApi(search?: string): Promise<Party[]> {
  const params: Record<string, any> = {};
  if (search && search.trim()) {
    params.q = search.trim();
  }
  const response = await apiClient.get<Party[]>("/parties", { params });
  return response.data;
}

export async function createPartyApi(data: PartyCreateInput): Promise<Party> {
  const response = await apiClient.post<Party>("/parties", data);
  return response.data;
}

export async function updatePartyApi(id: number, data: PartyUpdateInput): Promise<Party> {
  const response = await apiClient.patch<Party>(`/parties/${id}`, data);
  return response.data;
}

export async function deletePartyApi(id: number): Promise<{ detail: string; id: number }> {
  const response = await apiClient.delete<{ detail: string; id: number }>(`/parties/${id}`);
  return response.data;
}

export async function lookupGstApi(gstin: string): Promise<GSTLookupResult> {
  const response = await apiClient.get<GSTLookupResult>("/gst/lookup", {
    params: { gstin: gstin.trim().toUpperCase() },
  });
  return response.data;
}

export async function getCompanyPhoneApi(): Promise<string> {
  const response = await apiClient.get<{ company_phone: string }>("/settings/company-phone");
  return response.data.company_phone;
}

export async function updateCompanyPhoneApi(phone: string): Promise<string> {
  const response = await apiClient.put<{ company_phone: string }>("/settings/company-phone", { company_phone: phone });
  return response.data.company_phone;
}
