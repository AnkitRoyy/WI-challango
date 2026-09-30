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
  IconSun,
  IconMoon,
  IconMenu2,
  IconSettings,
  IconUserCircle,
} from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import { useMantineColorScheme } from "@mantine/core";
import { useAuth } from "../context/AuthContext";
import { useEntryModal } from "../context/ModalContext";
import { EntryFormModal } from "./EntryFormModal";
import { useDarkTokens } from "../utils/useDarkTokens";
import { useCapacitorNative } from "../utils/useCapacitorNative";

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);
  const { user, logout, isAdmin } = useAuth();
  const { isAddEntryOpen, openAddEntry, closeAddEntry } = useEntryModal();
  const location = useLocation();
  const { toggleColorScheme } = useMantineColorScheme();
  const t = useDarkTokens();

  // Handle native Android hardware back button and status bar theme
  useCapacitorNative({
    isModalOpen: isAddEntryOpen,
    closeModal: closeAddEntry,
    isDrawerOpen: drawerOpened,
    closeDrawer,
  });

  // Close the mobile drawer whenever the user navigates to a different route
  React.useEffect(() => {
    closeDrawer();
  }, [location.pathname]);

  // Horizontal swipe gestures — ONLY active when modal is closed
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // Do NOT intercept gestures when the entry modal is open — it breaks scroll
      if (isAddEntryOpen) return;
      if (e.touches.length !== 1) return;
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      if (isAddEntryOpen) { touchStartRef.current = null; return; }
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;

      // Horizontal gesture must strongly dominate vertical — prevents scroll interference
      if (Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(dx) > 60) {
        // Swiping left from right edge (last 40px) opens drawer
        if (dx < -60 && touchStartRef.current.x > window.innerWidth - 40 && !drawerOpened) {
          openDrawer();
        }
        // Swiping right closes drawer
        else if (dx > 60 && drawerOpened) {
          closeDrawer();
        }
      }
      touchStartRef.current = null;
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [drawerOpened, openDrawer, closeDrawer, isAddEntryOpen]);

  const desktopNavItems = [
    { label: "Delivery Entries", path: "/entries", icon: IconFileText },
    { label: "Parties", path: "/parties", icon: IconUsers },
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
                      WI - ChallanGo
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

              {/* Mobile Hamburger Header Action (Opens side drawer) */}
              <ActionIcon
                variant="default"
                size="md"
                radius="md"
                onClick={() => (drawerOpened ? closeDrawer() : openDrawer())}
                aria-label="Open side navigation menu"
                hiddenFrom="sm"
                style={{ borderColor: t.border }}
              >
                <IconMenu2 size={18} color={t.textPrimary} />
              </ActionIcon>

              {user && (
                <Box
                  component={Link}
                  to="/profile"
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    padding: "4px 8px",
                    borderRadius: "8px",
                    transition: "background-color 0.15s ease",
                  }}
                  className="profile-nav-link"
                  visibleFrom="xs"
                >
                  <Group gap="xs">
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
                </Box>
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

      {/* ── Mobile Bottom Nav — hidden when modal is open ── */}
      <Box
        hiddenFrom="sm"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          // Hide completely when modal is open — prevents blocking modal buttons
          display: isAddEntryOpen ? "none" : undefined,
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
          {/* 1. Entries */}
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

          {/* 2. Parties */}
          <Box
            component={Link}
            to="/parties"
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
              color: location.pathname.startsWith("/parties") ? t.accent : t.textMuted,
              padding: "4px 0",
              minHeight: "44px",
              justifyContent: "center",
            }}
          >
            <IconUsers size={22} stroke={location.pathname.startsWith("/parties") ? 2.5 : 1.7} />
            <Text size="10px" fw={location.pathname.startsWith("/parties") ? 700 : 500} mt={2}>Parties</Text>
          </Box>

          {/* 3. Center FAB — Add Entry */}
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

          {/* 4. Products */}
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

          {/* 5. Analytics (Replaced Menu as requested!) */}
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
            <IconChartBar
              size={22}
              stroke={
                (isAdmin
                  ? location.pathname.startsWith("/admin/analytics")
                  : location.pathname.startsWith("/import"))
                  ? 2.5
                  : 1.7
              }
            />
            <Text
              size="10px"
              fw={
                (isAdmin
                  ? location.pathname.startsWith("/admin/analytics")
                  : location.pathname.startsWith("/import"))
                  ? 700
                  : 500
              }
              mt={2}
            >
              {isAdmin ? "Analytics" : "Import"}
            </Text>
          </Box>
        </Group>
      </Box>

      {/* ── Mobile Side Hamburger Drawer ── Only items NOT in bottom bar ── */}
      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        position="right"
        size="280px"
        title={
          <Group gap="xs">
            <Box
              style={{
                backgroundColor: t.accent,
                color: "#FFFFFF",
                padding: "5px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <IconTruckDelivery size={18} />
            </Box>
            <Box>
              <Text fw={700} size="sm" c={t.textPrimary} lh={1.1}>
                WI - ChallanGo
              </Text>
              <Text size="10px" c={t.textSecondary}>
                Data Manager
              </Text>
            </Box>
          </Group>
        }
        styles={{
          content: { backgroundColor: t.surface },
          header: { backgroundColor: t.surface, borderBottom: `1px solid ${t.border}` },
          body: {
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
            paddingTop: "12px",
            display: "flex",
            flexDirection: "column",
            height: "calc(100% - 60px)",
          },
        }}
      >
        <Stack gap="xs" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* User identity card */}
          {user && (
            <Box
              component={Link}
              to="/profile"
              onClick={closeDrawer}
              p="xs"
              mb="xs"
              style={{
                backgroundColor: t.surfaceRaised,
                borderRadius: 8,
                textDecoration: "none",
                display: "block",
                border: `1px solid ${t.border}`,
              }}
            >
              <Group justify="space-between" align="center" wrap="nowrap">
                <Box style={{ overflow: "hidden", flex: 1 }}>
                  <Text fw={700} size="sm" c={t.textPrimary} lineClamp={1}>{user.name}</Text>
                  <Text size="xs" c={t.textSecondary} lineClamp={1}>{user.email}</Text>
                </Box>
                <Badge color={isAdmin ? "blue" : "teal"} size="xs" ml={6}>
                  {user.role.toUpperCase()}
                </Badge>
              </Group>
              <Text size="11px" c={t.accent} fw={600} mt={4}>
                Profile &amp; Settings →
              </Text>
            </Box>
          )}

          {/* Profile & Settings item */}
          <Button
            component={Link}
            to="/profile"
            onClick={closeDrawer}
            variant={location.pathname === "/profile" ? "light" : "subtle"}
            leftSection={<IconUserCircle size={18} />}
            justify="flex-start"
            size="sm"
            c={t.textPrimary}
          >
            My Profile &amp; Settings
          </Button>

          {/* Bulk Import — not in bottom nav */}
          <Button
            component={Link}
            to="/import"
            onClick={closeDrawer}
            variant={location.pathname === "/import" ? "light" : "subtle"}
            leftSection={<IconUpload size={18} />}
            justify="flex-start"
            size="sm"
            c={t.textPrimary}
          >
            Bulk Import
          </Button>

          {/* Admin-only section */}
          {isAdmin && (
            <>
              <Divider my={4} color={t.border} label={
                <Text size="10px" fw={700} c={t.textMuted} tt="uppercase">Admin Settings</Text>
              } />

              <Button
                component={Link}
                to="/admin/users"
                onClick={closeDrawer}
                variant={location.pathname === "/admin/users" ? "light" : "subtle"}
                leftSection={<IconSettings size={18} />}
                justify="flex-start"
                size="sm"
                c={t.textPrimary}
              >
                Users & Sequence Settings
              </Button>

              <Button
                component={Link}
                to="/admin/audit-logs"
                onClick={closeDrawer}
                variant={location.pathname === "/admin/audit-logs" ? "light" : "subtle"}
                leftSection={<IconHistory size={18} />}
                justify="flex-start"
                size="sm"
                c={t.textPrimary}
              >
                Audit Logs
              </Button>
            </>
          )}

          {/* Spacer pushes the bottom actions down */}
          <Box style={{ flex: 1 }} />

          <Divider color={t.border} />

          <Button
            variant="subtle"
            color="gray"
            onClick={() => toggleColorScheme()}
            leftSection={t.isDark ? <IconSun size={18} color="#FBBF24" /> : <IconMoon size={18} />}
            justify="flex-start"
            size="sm"
            c={t.textPrimary}
          >
            {t.isDark ? "Light Mode" : "Dark Mode"}
          </Button>

          <Button
            variant="light"
            color="red"
            onClick={() => { closeDrawer(); logout(); }}
            leftSection={<IconLogout size={18} />}
            justify="flex-start"
            size="sm"
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
