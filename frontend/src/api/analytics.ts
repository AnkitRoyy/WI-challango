import { apiClient } from "./client";

export interface AnalyticsBucket {
  bucket_label: string;
  bucket_date: string;
  entry_count: number;
  total_quantity: string | number;
  total_value: string | number;
}

export interface AnalyticsSummaryResponse {
  period: "day" | "week" | "month" | "year";
  date_from: string;
  date_to: string;
  total_entries: number;
  total_quantity: string | number;
  total_value: string | number;
  buckets: AnalyticsBucket[];
}

export interface TopProductItem {
  product: string;
  entry_count: number;
  total_quantity: string | number;
  total_value: string | number;
}

export interface TopProductsResponse {
  period: string;
  date_from: string;
  date_to: string;
  by_value: TopProductItem[];
  by_quantity: TopProductItem[];
}

export interface TopDestinationItem {
  destination: string;
  entry_count: number;
  total_quantity: string | number;
  total_value: string | number;
}

export interface TopDestinationsResponse {
  period: string;
  date_from: string;
  date_to: string;
  by_value: TopDestinationItem[];
  by_quantity: TopDestinationItem[];
}

export async function fetchAnalyticsSummaryApi(
  period: "day" | "week" | "month" | "year" = "month",
  date_from?: string,
  date_to?: string
): Promise<AnalyticsSummaryResponse> {
  const params: Record<string, any> = { period };
  if (date_from) params.date_from = date_from;
  if (date_to) params.date_to = date_to;

  const response = await apiClient.get<AnalyticsSummaryResponse>("/analytics/summary", { params });
  return response.data;
}

export async function fetchTopProductsApi(
  period: string = "month",
  date_from?: string,
  date_to?: string,
  limit: number = 10
): Promise<TopProductsResponse> {
  const params: Record<string, any> = { period, limit };
  if (date_from) params.date_from = date_from;
  if (date_to) params.date_to = date_to;

  const response = await apiClient.get<TopProductsResponse>("/analytics/top-products", { params });
  return response.data;
}

export async function fetchTopDestinationsApi(
  period: string = "month",
  date_from?: string,
  date_to?: string,
  limit: number = 10
): Promise<TopDestinationsResponse> {
  const params: Record<string, any> = { period, limit };
  if (date_from) params.date_from = date_from;
  if (date_to) params.date_to = date_to;

  const response = await apiClient.get<TopDestinationsResponse>("/analytics/top-destinations", { params });
  return response.data;
}
