import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider, createTheme, Loader, Center, Stack, Text, Box } from "@mantine/core";
import { IconTruckDelivery } from "@tabler/icons-react";
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
import { PartiesPage } from "./pages/PartiesPage";
import { ProfilePage } from "./pages/ProfilePage";

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

// Branded loading screen with graceful Render free tier server wake-up notification
const LoadingScreen: React.FC = () => {
  const [showWakingMessage, setShowWakingMessage] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setShowWakingMessage(true);
    }, 3500); // After 3.5s of loading, inform user that server is waking up
    return () => clearTimeout(timer);
  }, []);

  return (
    <Center
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--c-bg, #0A0A0A)",
        padding: "24px",
      }}
    >
      <Stack align="center" gap="md" maw={380} ta="center">
        <Box
          style={{
            backgroundColor: "#2563EB",
            color: "white",
            padding: "12px",
            borderRadius: "14px",
            display: "inline-flex",
            boxShadow: "0 6px 20px rgba(37, 99, 235, 0.4)",
          }}
        >
          <IconTruckDelivery size={36} />
        </Box>
        <Loader size="md" color="blue" type="dots" />
        <Text fw={600} size="md" c="var(--c-text-primary, #FFFFFF)">
          {showWakingMessage
            ? "Waking up server, this may take a moment..."
            : "Connecting to ChallanGo..."}
        </Text>
        {showWakingMessage && (
          <Text size="xs" c="var(--c-text-muted, #94A3B8)" style={{ lineHeight: 1.4 }}>
            Render free tier backend is spinning up from idle state (takes ~30-50s). Please hold on!
          </Text>
        )}
      </Stack>
    </Center>
  );
};

// Protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
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
    return <LoadingScreen />;
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
    return <LoadingScreen />;
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

                  {/* Protected parties catalog route */}
                  <Route
                    path="/parties"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <PartiesPage />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/parties"
                    element={<Navigate to="/parties" replace />}
                  />

                  {/* Protected user profile & company settings route */}
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <ProfilePage />
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
