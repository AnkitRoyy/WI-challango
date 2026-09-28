import { apiClient } from "./client";

export interface Product {
  id: number;
  name: string;
  default_unit_price: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: number | null;
}

export interface ProductCreatePayload {
  name: string;
  default_unit_price: number | string;
}

export interface ProductUpdatePayload {
  name?: string;
  default_unit_price?: number | string;
  is_active?: boolean;
}

export async function fetchProductsApi(search?: string, includeInactive = false): Promise<Product[]> {
  const response = await apiClient.get<Product[]>("/products", {
    params: {
      search: search || undefined,
      include_inactive: includeInactive ? true : undefined,
    },
  });
  return response.data;
}

export async function createProductApi(payload: ProductCreatePayload): Promise<Product> {
  const response = await apiClient.post<Product>("/products", payload);
  return response.data;
}

export async function updateProductApi(id: number, payload: ProductUpdatePayload): Promise<Product> {
  const response = await apiClient.patch<Product>(`/products/${id}`, payload);
  return response.data;
}

export async function deleteProductApi(id: number): Promise<{ detail: string; id: number }> {
  const response = await apiClient.delete<{ detail: string; id: number }>(`/products/${id}`);
  return response.data;
}
