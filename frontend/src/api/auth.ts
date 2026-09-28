import { apiClient, setStoredToken } from "./client";

export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "staff";
  is_active: boolean;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export async function loginApi(email: string, password: string): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>("/auth/login", {
    email: email.trim(),
    password,
  });
  setStoredToken(response.data.access_token);
  return response.data;
}

export async function getMeApi(): Promise<User> {
  const response = await apiClient.get<User>("/auth/me");
  return response.data;
}
