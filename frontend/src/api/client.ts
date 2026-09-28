import axios from "axios";

// Tradeoff Note: Storing JWT in localStorage is the simplest approach for SPAs and preserves
// session state across page reloads. However, it is accessible to JavaScript and therefore
// vulnerable to XSS attacks if untrusted scripts are executed. For heightened production hardening,
// HttpOnly SameSite secure cookies can be used with backend CSRF protection.
const TOKEN_KEY = "challango_jwt_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

export const apiClient = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: attach bearer token
apiClient.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: global 401 redirect
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and redirect to login if not already on login page
      clearStoredToken();
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
