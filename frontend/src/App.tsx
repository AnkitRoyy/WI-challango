import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider, createTheme, Loader, Center } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { ModalProvider } from "./context/ModalContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { EntriesPage } from "./pages/EntriesPage";
import { ImportPage } from "./pages/ImportPage";
import { UsersPage } from "./pages/UsersPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { ProductsPage } from "./pages/ProductsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 30, // 30 seconds
    },
  },
});

const theme = createTheme({
  primaryColor: "blue",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  headings: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  colors: {
    // Keep Mantine's default blue scale — accent never changes
    dark: [
      "#A0A0A0", // 0 - text-muted equivalent
      "#6E6E6E",
      "#555555",
      "#3A3A3A",
      "#2A2A2A",
      "#1A1A1A", // 5 - surface-raised
      "#111111", // 6 - surface (Mantine uses dark[6] for card bg)
      "#0A0A0A",
      "#050505",
      "#000000", // 9 - bg (Mantine uses dark[8] for page bg)
    ],
  },
});

// Protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Center style={{ minHeight: "100vh", backgroundColor: "var(--c-bg)" }}>
        <Loader size="lg" color="blue" type="dots" />
      </Center>
    );
  }

  if (!token && !user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Admin-only route wrapper
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <Center style={{ minHeight: "100vh", backgroundColor: "var(--c-bg)" }}>
        <Loader size="lg" color="blue" type="dots" />
      </Center>
    );
  }

  if (!token && !user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/entries" replace />;
  }

  return <>{children}</>;
};

// Public route wrapper that redirects to /entries if user is already logged in
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Center style={{ minHeight: "100vh", backgroundColor: "#0F172A" }}>
        <Loader size="lg" color="blue" type="dots" />
      </Center>
    );
  }

  if (token || user) {
    return <Navigate to="/entries" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <Notifications position="top-right" zIndex={2000} />
          <AuthProvider>
            <BrowserRouter>
              <ModalProvider>
                <Routes>
                  {/* Public route */}
                  <Route
                    path="/login"
                    element={
                      <PublicRoute>
                        <LoginPage />
                      </PublicRoute>
                    }
                  />

                  {/* Protected delivery entries route */}
                  <Route
                    path="/entries"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <EntriesPage />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected bulk import route */}
                  <Route
                    path="/import"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <ImportPage />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Admin-only routes */}
                  <Route
                    path="/admin/analytics"
                    element={
                      <AdminRoute>
                        <Layout>
                          <AnalyticsPage />
                        </Layout>
                      </AdminRoute>
                    }
                  />

                  <Route
                    path="/admin/products"
                    element={
                      <AdminRoute>
                        <Layout>
                          <ProductsPage />
                        </Layout>
                      </AdminRoute>
                    }
                  />

                  <Route
                    path="/admin/users"
                    element={
                      <AdminRoute>
                        <Layout>
                          <UsersPage />
                        </Layout>
                      </AdminRoute>
                    }
                  />

                  <Route
                    path="/admin/audit-logs"
                    element={
                      <AdminRoute>
                        <Layout>
                          <AuditLogsPage />
                        </Layout>
                      </AdminRoute>
                    }
                  />

                  {/* Default redirects */}
                  <Route path="/" element={<Navigate to="/entries" replace />} />
                  <Route path="*" element={<Navigate to="/entries" replace />} />
                </Routes>
              </ModalProvider>
            </BrowserRouter>
          </AuthProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    </MantineProvider>
  );
}

export default App;
