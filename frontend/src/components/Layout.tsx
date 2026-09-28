import React from "react";
import {
  AppShell,
  Group,
  Text,
  Badge,
  Button,
  Container,
  Box,
  Divider,
  ActionIcon,
  Drawer,
  Stack,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconFileText,
  IconLogout,
  IconTruckDelivery,
  IconUpload,
  IconUsers,
  IconHistory,
  IconBuildingStore,
  IconChartBar,
  IconPlus,
  IconDots,
  IconSun,
  IconMoon,
} from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import { useMantineColorScheme } from "@mantine/core";
import { useAuth } from "../context/AuthContext";
import { useEntryModal } from "../context/ModalContext";
import { EntryFormModal } from "./EntryFormModal";
import { useDarkTokens } from "../utils/useDarkTokens";

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);
  const { user, logout, isAdmin } = useAuth();
  const { isAddEntryOpen, openAddEntry, closeAddEntry } = useEntryModal();
  const location = useLocation();
  const { toggleColorScheme } = useMantineColorScheme();
  const t = useDarkTokens();

  // Close the mobile drawer whenever the user navigates to a different route
  React.useEffect(() => {
    closeDrawer();
  }, [location.pathname]);

  const desktopNavItems = [
    { label: "Delivery Entries", path: "/entries", icon: IconFileText },
    { label: "Products Catalog", path: "/admin/products", icon: IconBuildingStore },
    { label: "Bulk Import", path: "/import", icon: IconUpload },
    ...(isAdmin
      ? [
          { label: "Analytics", path: "/admin/analytics", icon: IconChartBar },
          { label: "Users", path: "/admin/users", icon: IconUsers },
          { label: "Audit Logs", path: "/admin/audit-logs", icon: IconHistory },
        ]
      : []),
  ];

  const isActive = (path: string) =>
    path === "/entries"
      ? location.pathname === "/entries"
      : location.pathname.startsWith(path);

  return (
    <AppShell
      header={{ height: 64 }}
      padding="md"
      styles={{
        main: {
          backgroundColor: t.bg,
          minHeight: "100vh",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 85px)",
        },
      }}
    >
      {/* ── Desktop Header ── */}
      <AppShell.Header
        style={{
          backgroundColor: t.surface,
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <Container size="xl" h="100%">
          <Group justify="space-between" h="100%">
            {/* Logo */}
            <Group gap="sm">
              <Link to="/entries" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
                <Group gap="xs" style={{ cursor: "pointer" }}>
                  <Box
                    style={{
                      backgroundColor: t.accent,
                      color: "#FFFFFF",
                      padding: "6px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <IconTruckDelivery size={22} />
                  </Box>
                  <Box>
                    <Text fw={700} size="lg" c={t.textPrimary} style={{ lineHeight: 1.1 }}>
                      ChallanGo
                    </Text>
                    <Text size="xs" c={t.textSecondary} fw={500}>
                      Data Manager
                    </Text>
                  </Box>
                </Group>
              </Link>

              {/* Desktop Nav */}
              <Group gap="xs" ml="xl" visibleFrom="sm">
                {desktopNavItems.map((item) => (
                  <Button
                    key={item.path}
                    component={Link}
                    to={item.path}
                    variant={isActive(item.path) ? "light" : "subtle"}
                    color="blue"
                    leftSection={<item.icon size={16} />}
                    size="sm"
                    radius="md"
                  >
                    {item.label}
                  </Button>
                ))}
              </Group>
            </Group>

            {/* Right: user info + actions */}
            <Group gap="sm">
              <ActionIcon
                variant="default"
                size="md"
                radius="md"
                onClick={() => toggleColorScheme()}
                aria-label="Toggle color scheme"
                style={{ borderColor: t.border }}
              >
                {t.isDark ? <IconSun size={18} color="#FBBF24" /> : <IconMoon size={18} color={t.textSecondary} />}
              </ActionIcon>

              {user && (
                <Group gap="xs" visibleFrom="xs">
                  <Box style={{ textAlign: "right" }}>
                    <Text size="sm" fw={600} c={t.textPrimary}>{user.name}</Text>
                    <Text size="xs" c={t.textSecondary}>{user.email}</Text>
                  </Box>
                  <Badge
                    color={isAdmin ? "blue" : "teal"}
                    variant="light"
                    size="sm"
                    radius="sm"
                    tt="uppercase"
                  >
                    {user.role}
                  </Badge>
                </Group>
              )}

              <Button
                variant="default"
                size="xs"
                onClick={logout}
                leftSection={<IconLogout size={14} />}
                radius="md"
                visibleFrom="sm"
                style={{ borderColor: t.border, color: t.textSecondary }}
              >
                Logout
              </Button>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      {/* ── Main Content ── */}
      <AppShell.Main>
        <Container size="xl" p={0}>
          {children}
        </Container>
      </AppShell.Main>

      {/* ── Mobile Bottom Nav ── */}
      <Box
        hiddenFrom="sm"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 300,
          backgroundColor: t.isDark
            ? "rgba(17,17,17,0.97)"
            : "rgba(255,255,255,0.97)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderTop: `1px solid ${t.border}`,
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4px)",
          paddingTop: "6px",
          boxShadow: t.isDark
            ? "0 -2px 16px rgba(0,0,0,0.6)"
            : "0 -2px 10px rgba(0,0,0,0.06)",
        }}
      >
        <Group justify="space-around" align="center" gap={0} wrap="nowrap" px="xs">
          {/* Entries */}
          <Box
            component={Link}
            to="/entries"
            onClick={() => {
              closeDrawer();
              closeAddEntry();
            }}
            style={{
              textDecoration: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              flex: 1,
              color: location.pathname === "/entries" ? t.accent : t.textMuted,
              padding: "4px 0",
              minHeight: "44px",
              justifyContent: "center",
            }}
          >
            <IconFileText size={22} stroke={location.pathname === "/entries" ? 2.5 : 1.7} />
            <Text size="10px" fw={location.pathname === "/entries" ? 700 : 500} mt={2}>Entries</Text>
          </Box>

          {/* Products */}
          <Box
            component={Link}
            to="/admin/products"
            onClick={() => {
              closeDrawer();
              closeAddEntry();
            }}
            style={{
              textDecoration: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              flex: 1,
              color: location.pathname.startsWith("/admin/products") ? t.accent : t.textMuted,
              padding: "4px 0",
              minHeight: "44px",
              justifyContent: "center",
            }}
          >
            <IconBuildingStore size={22} stroke={location.pathname.startsWith("/admin/products") ? 2.5 : 1.7} />
            <Text size="10px" fw={location.pathname.startsWith("/admin/products") ? 700 : 500} mt={2}>Products</Text>
          </Box>

          {/* Center FAB — Add Entry */}
          <Box style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", marginTop: -20 }}>
            <ActionIcon
              size={52}
              radius="50%"
              color="blue"
              variant="filled"
              onClick={() => {
                closeDrawer();
                openAddEntry();
              }}
              style={{
                boxShadow: "0 6px 20px rgba(37,99,235,0.5)",
                border: t.isDark ? "3px solid #111111" : "3px solid #FFFFFF",
              }}
              aria-label="Add new entry"
            >
              <IconPlus size={26} stroke={2.5} />
            </ActionIcon>
          </Box>

          {/* Analytics / Import */}
          <Box
            component={Link}
            to={isAdmin ? "/admin/analytics" : "/import"}
            onClick={() => {
              closeDrawer();
              closeAddEntry();
            }}
            style={{
              textDecoration: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              flex: 1,
              color: (isAdmin
                ? location.pathname.startsWith("/admin/analytics")
                : location.pathname.startsWith("/import"))
                ? t.accent
                : t.textMuted,
              padding: "4px 0",
              minHeight: "44px",
              justifyContent: "center",
            }}
          >
            {isAdmin ? (
              <>
                <IconChartBar size={22} stroke={location.pathname.startsWith("/admin/analytics") ? 2.5 : 1.7} />
                <Text size="10px" fw={location.pathname.startsWith("/admin/analytics") ? 700 : 500} mt={2}>Analytics</Text>
              </>
            ) : (
              <>
                <IconUpload size={22} stroke={location.pathname.startsWith("/import") ? 2.5 : 1.7} />
                <Text size="10px" fw={location.pathname.startsWith("/import") ? 700 : 500} mt={2}>Import</Text>
              </>
            )}
          </Box>

          {/* More menu */}
          <Box
            onClick={() => {
              if (drawerOpened) {
                closeDrawer();
              } else {
                closeAddEntry();
                openDrawer();
              }
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              flex: 1,
              cursor: "pointer",
              color: drawerOpened ? t.accent : t.textMuted,
              padding: "4px 0",
              minHeight: "44px",
              justifyContent: "center",
            }}
          >
            <IconDots size={22} stroke={drawerOpened ? 2.5 : 1.7} />
            <Text size="10px" fw={drawerOpened ? 700 : 500} mt={2}>Menu</Text>
          </Box>
        </Group>
      </Box>

      {/* ── Mobile "More" Drawer ── */}
      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        position="bottom"
        radius="md"
        size="auto"
        title={
          <Group gap="xs">
            <IconTruckDelivery size={20} color={t.accent} />
            <Text fw={700} size="sm" c={t.textPrimary}>ChallanGo Menu</Text>
          </Group>
        }
        styles={{
          content: { backgroundColor: t.surface },
          header: { backgroundColor: t.surface, borderBottom: `1px solid ${t.border}` },
          body: { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" },
        }}
      >
        <Stack gap="xs">
          {user && (
            <Box p="sm" style={{ backgroundColor: t.surfaceRaised, borderRadius: 8 }}>
              <Group justify="space-between" align="center">
                <Box>
                  <Text fw={700} size="sm" c={t.textPrimary}>{user.name}</Text>
                  <Text size="xs" c={t.textSecondary}>{user.email}</Text>
                </Box>
                <Badge color={isAdmin ? "blue" : "teal"} size="sm">{user.role.toUpperCase()}</Badge>
              </Group>
            </Box>
          )}

          <Button
            component={Link}
            to="/import"
            onClick={closeDrawer}
            variant={location.pathname === "/import" ? "light" : "subtle"}
            leftSection={<IconUpload size={18} />}
            justify="flex-start"
            size="md"
            c={t.textPrimary}
          >
            Bulk Import Spreadsheet
          </Button>

          {isAdmin && (
            <>
              <Button
                component={Link}
                to="/admin/users"
                onClick={closeDrawer}
                variant={location.pathname === "/admin/users" ? "light" : "subtle"}
                leftSection={<IconUsers size={18} />}
                justify="flex-start"
                size="md"
                c={t.textPrimary}
              >
                User Management
              </Button>

              <Button
                component={Link}
                to="/admin/audit-logs"
                onClick={closeDrawer}
                variant={location.pathname === "/admin/audit-logs" ? "light" : "subtle"}
                leftSection={<IconHistory size={18} />}
                justify="flex-start"
                size="md"
                c={t.textPrimary}
              >
                Audit Logs
              </Button>
            </>
          )}

          <Divider my="xs" color={t.border} />

          <Button
            variant="subtle"
            color="gray"
            onClick={() => toggleColorScheme()}
            leftSection={t.isDark ? <IconSun size={18} color="#FBBF24" /> : <IconMoon size={18} />}
            justify="flex-start"
            size="md"
            c={t.textPrimary}
          >
            {t.isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          </Button>

          <Button
            variant="light"
            color="red"
            onClick={() => { closeDrawer(); logout(); }}
            leftSection={<IconLogout size={18} />}
            size="md"
            mt="xs"
          >
            Logout
          </Button>
        </Stack>
      </Drawer>

      {/* Global Entry Form Modal */}
      <EntryFormModal opened={isAddEntryOpen} onClose={closeAddEntry} />
    </AppShell>
  );
};
