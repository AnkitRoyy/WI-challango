import { apiClient } from "./client";

export interface AuditLogItem {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  action: string;
  entry_id: number | null;
  details: Record<string, any>;
  created_at: string;
}

export interface AuditLogListResponse {
  items: AuditLogItem[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AuditLogFilters {
  action?: string;
  user_id?: number;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export async function fetchAuditLogsApi(
  filters: AuditLogFilters
): Promise<AuditLogListResponse> {
  const cleanParams: Record<string, any> = {};
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      cleanParams[k] = v;
    }
  });

  const response = await apiClient.get<AuditLogListResponse>("/audit-logs", {
    params: cleanParams,
  });
  return response.data;
}
