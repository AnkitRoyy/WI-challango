import { apiClient } from "./client";
import type { User } from "./auth";

export interface UserCreatePayload {
  name: string;
  email: string;
  password: string;
  role: "admin" | "staff";
}

export interface UserListResponse {
  items: User[];
  total: number;
  skip: number;
  limit: number;
}

export async function fetchUsersApi(skip = 0, limit = 50): Promise<UserListResponse> {
  const response = await apiClient.get<UserListResponse>("/users", {
    params: { skip, limit },
  });
  return response.data;
}

export async function createUserApi(payload: UserCreatePayload): Promise<User> {
  const response = await apiClient.post<User>("/users", payload);
  return response.data;
}

export async function deactivateUserApi(userId: number): Promise<User> {
  const response = await apiClient.patch<User>(`/users/${userId}/deactivate`);
  return response.data;
}

export async function hardDeleteUserApi(userId: number): Promise<{ detail: string; id: number }> {
  const response = await apiClient.delete<{ detail: string; id: number }>(`/users/${userId}`);
  return response.data;
}
