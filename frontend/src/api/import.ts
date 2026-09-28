import { apiClient } from "./client";

export type RowStatus = "ok" | "warning" | "duplicate" | "error";

export interface ImportRowPreview {
  row_number: number;
  status: RowStatus;
  messages: string[];
  data: Record<string, any>;
}

export interface ImportPreviewResponse {
  preview_id: string;
  filename: string;
  total_rows: number;
  ok_count: number;
  warning_count: number;
  duplicate_count: number;
  error_count: number;
  rows: ImportRowPreview[];
}

export interface ImportCommitRequest {
  preview_id: string;
  duplicate_strategy: "skip" | "update";
}

export interface ImportCommitResponse {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  message: string;
}

export async function downloadImportTemplateApi(): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get("/entries/import/template", {
    responseType: "blob",
  });
  return { blob: response.data, filename: "challan_import_template.xlsx" };
}

export async function previewImportApi(file: File): Promise<ImportPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<ImportPreviewResponse>(
    "/entries/import/preview",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
  return response.data;
}

export async function commitImportApi(
  payload: ImportCommitRequest
): Promise<ImportCommitResponse> {
  const response = await apiClient.post<ImportCommitResponse>(
    "/entries/import/commit",
    payload
  );
  return response.data;
}
