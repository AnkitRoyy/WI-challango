import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Paper,
  Title,
  Text,
  Group,
  Stack,
  TextInput,
  Button,
  Table,
  Badge,
  ActionIcon,
  Tooltip,
  Pagination,
  Select,
  Alert,
  Skeleton,
  SimpleGrid,
  Card,
  UnstyledButton,
  Drawer,
  Menu,
  useMantineColorScheme,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import {
  IconSearch,
  IconPlus,
  IconFileSpreadsheet,
  IconFileText,
  IconEdit,
  IconTrash,
  IconArrowsSort,
  IconSortAscending,
  IconSortDescending,
  IconFilter,
  IconFilterOff,
  IconAlertCircle,
  IconCheck,
  IconTruckDelivery,
  IconPackage,
  IconCash,
  IconMapPin,
  IconDotsVertical,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";

import {
  fetchEntries,
  fetchEntriesSummary,
  exportEntriesApi,
  type Entry,
  type EntryFilters,
} from "../api/entries";
import { formatIndianCurrency, formatDate } from "../utils/formatters";
import { useAuth } from "../context/AuthContext";
import { EntryFormModal } from "../components/EntryFormModal";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";

export const EntriesPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL query parameters with fallbacks
  const urlPage = parseInt(searchParams.get("page") || "1", 10);
  const urlPageSize = parseInt(searchParams.get("page_size") || "10", 10);
  const urlQ = searchParams.get("q") || "";
  const urlSortBy = searchParams.get("sort_by") || "created_at";
  const urlSortDir = (searchParams.get("sort_dir") || "desc") as "asc" | "desc";
  const urlDateFrom = searchParams.get("date_from") || "";
  const urlDateTo = searchParams.get("date_to") || "";
  const urlProduct = searchParams.get("product") || "";
  const urlVehicleNo = searchParams.get("vehicle_no") || "";
  const urlDestination = searchParams.get("destination") || "";

  // Local search input for immediate responsive typing
  const [searchInput, setSearchInput] = useState(urlQ);
  const [debouncedSearch] = useDebouncedValue(searchInput, 350);

  // Mobile filters drawer
  const [filterDrawerOpened, { open: openFilterDrawer, close: closeFilterDrawer }] = useDisclosure(false);

  // Pull-to-refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Accumulated entries for mobile infinite scroll
  const [mobileEntries, setMobileEntries] = useState<Entry[]>([]);

  // Sentinel ref for infinite scroll
  const infiniteScrollSentinelRef = useRef<HTMLDivElement | null>(null);

  // Tracks the "filter key" — when any filter besides page changes, clear the list
  const filterKey = useMemo(
    () =>
      [urlQ, urlSortBy, urlSortDir, urlDateFrom, urlDateTo, urlProduct, urlVehicleNo, urlDestination, urlPageSize].join("|"),
    [urlQ, urlSortBy, urlSortDir, urlDateFrom, urlDateTo, urlProduct, urlVehicleNo, urlDestination, urlPageSize]
  );

  // Sync debounced search with URL
  useEffect(() => {
    if (debouncedSearch !== urlQ) {
      updateFilters({ q: debouncedSearch, page: 1 });
    }
  }, [debouncedSearch]);

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedEntryForEdit, setSelectedEntryForEdit] = useState<Entry | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<Entry | null>(null);

  // Export loading state
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  // Helper to update URL search parameters cleanly
  const updateFilters = (updates: Partial<EntryFilters>) => {
    const current: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      current[key] = val;
    });

    Object.entries(updates).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") {
        delete current[k];
      } else {
        current[k] = String(v);
      }
    });

    setSearchParams(current);
  };

  // Convert string dates to DatePickerInput format [Date | null, Date | null]
  const dateRangeValue: [Date | null, Date | null] = useMemo(() => {
    const from = urlDateFrom ? dayjs(urlDateFrom).toDate() : null;
    const to = urlDateTo ? dayjs(urlDateTo).toDate() : null;
    return [from, to];
  }, [urlDateFrom, urlDateTo]);

  // Current active filters object
  const currentFilters: EntryFilters = useMemo(
    () => ({
      page: urlPage,
      page_size: urlPageSize,
      sort_by: urlSortBy,
      sort_dir: urlSortDir,
      q: urlQ || undefined,
      date_from: urlDateFrom || undefined,
      date_to: urlDateTo || undefined,
      product: urlProduct || undefined,
      vehicle_no: urlVehicleNo || undefined,
      destination: urlDestination || undefined,
    }),
    [
      urlPage,
      urlPageSize,
      urlSortBy,
      urlSortDir,
      urlQ,
      urlDateFrom,
      urlDateTo,
      urlProduct,
      urlVehicleNo,
      urlDestination,
    ]
  );

  // Fetch entries query
  const entriesQuery = useQuery({
    queryKey: ["entries", currentFilters],
    queryFn: () => fetchEntries(currentFilters),
    placeholderData: (prev) => prev,
  });

  // Fetch summary totals query
  const summaryQuery = useQuery({
    queryKey: ["entries-summary", currentFilters],
    queryFn: () => fetchEntriesSummary(currentFilters),
  });

  // When filter key changes (not page), reset accumulated list
  const prevFilterKey = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKey.current !== filterKey) {
      prevFilterKey.current = filterKey;
      setMobileEntries([]);
    }
  }, [filterKey]);

  // Append pages to accumulated list
  useEffect(() => {
    if (!entriesQuery.data?.items) return;
    if (urlPage === 1) {
      setMobileEntries(entriesQuery.data.items);
    } else {
      setMobileEntries((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const next = entriesQuery.data?.items.filter((e) => !existingIds.has(e.id)) || [];
        return [...prev, ...next];
      });
    }
  }, [entriesQuery.data?.items, urlPage]);

  // Infinite scroll: load next page when sentinel enters viewport
  const hasMore =
    entriesQuery.data != null &&
    mobileEntries.length < entriesQuery.data.total_count;

  const loadNextPage = useCallback(() => {
    if (!entriesQuery.isFetching && hasMore) {
      updateFilters({ page: urlPage + 1 });
    }
  }, [entriesQuery.isFetching, hasMore, urlPage]);

  useEffect(() => {
    const sentinel = infiniteScrollSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadNextPage();
        }
      },
      { rootMargin: "300px" } // Trigger 300px before sentinel enters view
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadNextPage]);

  // Sort toggler
  const handleSort = (field: string) => {
    if (urlSortBy === field) {
      const nextDir = urlSortDir === "asc" ? "desc" : "asc";
      updateFilters({ sort_by: field, sort_dir: nextDir, page: 1 });
    } else {
      updateFilters({ sort_by: field, sort_dir: "asc", page: 1 });
    }
  };

  const getSortIcon = (field: string) => {
    if (urlSortBy !== field) {
      return <IconArrowsSort size={14} color="#94A3B8" />;
    }
    return urlSortDir === "asc" ? (
      <IconSortAscending size={14} color="#2563EB" />
    ) : (
      <IconSortDescending size={14} color="#2563EB" />
    );
  };

  // Export handler
  const handleExport = async (format: "xlsx" | "csv") => {
    const setLoading = format === "xlsx" ? setIsExportingXlsx : setIsExportingCsv;
    setLoading(true);

    try {
      const { blob, filename } = await exportEntriesApi(currentFilters, format);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      notifications.show({
        title: "Export Completed",
        message: `Successfully downloaded ${filename}`,
        color: "green",
        icon: <IconCheck size={18} />,
      });
    } catch (err: any) {
      notifications.show({
        title: "Export Failed",
        message: err?.response?.data?.detail || "Could not generate export file.",
        color: "red",
        icon: <IconAlertCircle size={18} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setSearchParams({
      page: "1",
      page_size: String(urlPageSize),
      sort_by: "created_at",
      sort_dir: "desc",
    });
    closeFilterDrawer();
  };

  // Pull-to-refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([entriesQuery.refetch(), summaryQuery.refetch()]);
      notifications.show({
        title: "Refreshed",
        message: "Entries updated to latest state",
        color: "blue",
        icon: <IconCheck size={16} />,
        autoClose: 2000,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Active filter count (excluding free-text search which is always visible)
  const activeFiltersCount =
    (urlDateFrom || urlDateTo ? 1 : 0) +
    (urlProduct ? 1 : 0) +
    (urlDestination ? 1 : 0) +
    (urlVehicleNo ? 1 : 0);

  const isFiltered = Boolean(urlQ || activeFiltersCount > 0);
  const totalEntriesCount = summaryQuery.data?.count ?? 0;
  const hasZeroResults = totalEntriesCount === 0;

  const cardBg = isDark ? "#1E293B" : "#FFFFFF";
  const cardBorder = isDark ? "#334155" : "#E2E8F0";
  const textPrimary = isDark ? "#F8FAFC" : "#0F172A";
  const textMuted = isDark ? "#94A3B8" : "#64748B";

  return (
    <Box py="sm">
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER & TOP ACTIONS
          ───────────────────────────────────────────────────────────── */}
      <Group justify="space-between" align="center" mb="sm" wrap="wrap" gap="xs">
        <Box>
          <Title order={1} size="h3" fw={800} c={textPrimary}>
            Delivery Challan Entries
          </Title>
          <Text size="xs" c={textMuted} visibleFrom="xs">
            Manage, filter, and track delivery records across Indian routes
          </Text>
        </Box>

        <Group gap="xs" wrap="wrap">
          {/* Mobile Refresh Button */}
          <ActionIcon
            variant="default"
            size="lg"
            radius="md"
            onClick={handleRefresh}
            loading={isRefreshing}
            hiddenFrom="sm"
            aria-label="Refresh entries"
          >
            <IconRefresh size={18} />
          </ActionIcon>

          {/* Desktop Export Buttons */}
          <Box visibleFrom="sm">
            <Group gap="xs">
              <Tooltip label={hasZeroResults ? "No records to export" : "Export current view as Excel (.xlsx)"}>
                <span>
                  <Button
                    variant="default"
                    color="blue"
                    size="xs"
                    radius="md"
                    leftSection={<IconFileSpreadsheet size={15} color="#16A34A" />}
                    loading={isExportingXlsx}
                    onClick={() => handleExport("xlsx")}
                    disabled={hasZeroResults || entriesQuery.isLoading}
                  >
                    Export XLSX
                  </Button>
                </span>
              </Tooltip>

              <Tooltip label={hasZeroResults ? "No records to export" : "Export current view as CSV"}>
                <span>
                  <Button
                    variant="default"
                    size="xs"
                    radius="md"
                    leftSection={<IconFileText size={15} color="#2563EB" />}
                    loading={isExportingCsv}
                    onClick={() => handleExport("csv")}
                    disabled={hasZeroResults || entriesQuery.isLoading}
                  >
                    Export CSV
                  </Button>
                </span>
              </Tooltip>
            </Group>
          </Box>

          {/* Desktop Add Entry Button */}
          <Button
            color="blue"
            size="sm"
            radius="md"
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              setSelectedEntryForEdit(null);
              setIsFormModalOpen(true);
            }}
            visibleFrom="sm"
            style={{
              boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)",
            }}
          >
            Add Entry
          </Button>
        </Group>
      </Group>

      {/* ─────────────────────────────────────────────────────────────
          2. SUMMARY CARDS
          - Mobile: Compact horizontal scrollable stat strip (condensed)
          - Desktop: 3 full-height cards in SimpleGrid
          ───────────────────────────────────────────────────────────── */}

      {/* MOBILE CONDENSED STAT STRIP */}
      <Box
        hiddenFrom="sm"
        mb="sm"
        style={{
          overflowX: "auto",
          whiteSpace: "nowrap",
          paddingBottom: 4,
        }}
        className="no-scrollbar"
      >
        <Group gap="xs" wrap="nowrap">
          {/* Stat 1: Entries */}
          <Paper
            withBorder
            radius="md"
            p="xs"
            style={{
              backgroundColor: cardBg,
              borderColor: cardBorder,
              minWidth: 120,
              flexShrink: 0,
            }}
          >
            <Group gap={6} align="center" wrap="nowrap">
              <Box p={4} style={{ backgroundColor: isDark ? "#1E3A8A" : "#EFF6FF", borderRadius: "6px" }}>
                <IconTruckDelivery size={16} color="#2563EB" />
              </Box>
              <Box>
                <Text size="10px" fw={700} c={textMuted} tt="uppercase">
                  Entries
                </Text>
                {summaryQuery.isLoading ? (
                  <Skeleton height={18} width={40} />
                ) : (
                  <Text size="sm" fw={800} c={textPrimary}>
                    {summaryQuery.data?.count ?? 0}
                  </Text>
                )}
              </Box>
            </Group>
          </Paper>

          {/* Stat 2: Quantity */}
          <Paper
            withBorder
            radius="md"
            p="xs"
            style={{
              backgroundColor: cardBg,
              borderColor: cardBorder,
              minWidth: 120,
              flexShrink: 0,
            }}
          >
            <Group gap={6} align="center" wrap="nowrap">
              <Box p={4} style={{ backgroundColor: isDark ? "#064E3B" : "#F0FDF4", borderRadius: "6px" }}>
                <IconPackage size={16} color="#16A34A" />
              </Box>
              <Box>
                <Text size="10px" fw={700} c={textMuted} tt="uppercase">
                  Quantity
                </Text>
                {summaryQuery.isLoading ? (
                  <Skeleton height={18} width={50} />
                ) : (
                  <Text size="sm" fw={800} c={textPrimary}>
                    {Number(summaryQuery.data?.sum_quantity ?? 0).toLocaleString("en-IN", {
                      maximumFractionDigits: 1,
                    })}
                  </Text>
                )}
              </Box>
            </Group>
          </Paper>

          {/* Stat 3: Valuation */}
          <Paper
            withBorder
            radius="md"
            p="xs"
            style={{
              backgroundColor: cardBg,
              borderColor: cardBorder,
              minWidth: 150,
              flexShrink: 0,
            }}
          >
            <Group gap={6} align="center" wrap="nowrap">
              <Box p={4} style={{ backgroundColor: isDark ? "#1E3A8A" : "#EFF6FF", borderRadius: "6px" }}>
                <IconCash size={16} color="#2563EB" />
              </Box>
              <Box>
                <Text size="10px" fw={700} c={textMuted} tt="uppercase">
                  Valuation
                </Text>
                {summaryQuery.isLoading ? (
                  <Skeleton height={18} width={70} />
                ) : (
                  <Text size="sm" fw={800} c="#2563EB">
                    {formatIndianCurrency(summaryQuery.data?.sum_total_price ?? 0)}
                  </Text>
                )}
              </Box>
            </Group>
          </Paper>
        </Group>
      </Box>

      {/* DESKTOP 3-CARD GRID */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mb="md" visibleFrom="sm">
        <Card withBorder radius="md" p="md" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
          <Group justify="space-between" align="flex-start">
            <Box>
              <Text size="xs" fw={700} c={textMuted} tt="uppercase">
                Matching Entries
              </Text>
              {summaryQuery.isLoading ? (
                <Skeleton height={28} width={80} mt={6} radius="sm" />
              ) : (
                <Text size="xl" fw={800} c={textPrimary}>
                  {summaryQuery.data?.count ?? 0}
                </Text>
              )}
            </Box>
            <Box p={8} style={{ backgroundColor: isDark ? "#1E3A8A" : "#EFF6FF", borderRadius: "8px" }}>
              <IconTruckDelivery size={22} color="#2563EB" />
            </Box>
          </Group>
          <Text size="xs" c={textMuted} mt="xs">
            {isFiltered ? "Filtered from database" : "Total active records"}
          </Text>
        </Card>

        <Card withBorder radius="md" p="md" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
          <Group justify="space-between" align="flex-start">
            <Box>
              <Text size="xs" fw={700} c={textMuted} tt="uppercase">
                Total Quantity
              </Text>
              {summaryQuery.isLoading ? (
                <Skeleton height={28} width={100} mt={6} radius="sm" />
              ) : (
                <Text size="xl" fw={800} c={textPrimary}>
                  {Number(summaryQuery.data?.sum_quantity ?? 0).toLocaleString("en-IN", {
                    maximumFractionDigits: 2,
                  })}
                </Text>
              )}
            </Box>
            <Box p={8} style={{ backgroundColor: isDark ? "#064E3B" : "#F0FDF4", borderRadius: "8px" }}>
              <IconPackage size={22} color="#16A34A" />
            </Box>
          </Group>
          <Text size="xs" c={textMuted} mt="xs">
            Sum of units dispatched
          </Text>
        </Card>

        <Card withBorder radius="md" p="md" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
          <Group justify="space-between" align="flex-start">
            <Box>
              <Text size="xs" fw={700} c={textMuted} tt="uppercase">
                Total Valuation
              </Text>
              {summaryQuery.isLoading ? (
                <Skeleton height={28} width={130} mt={6} radius="sm" />
              ) : (
                <Text size="xl" fw={800} c="#2563EB">
                  {formatIndianCurrency(summaryQuery.data?.sum_total_price ?? 0)}
                </Text>
              )}
            </Box>
            <Box p={8} style={{ backgroundColor: isDark ? "#1E3A8A" : "#EFF6FF", borderRadius: "8px" }}>
              <IconCash size={22} color="#2563EB" />
            </Box>
          </Group>
          <Text size="xs" c={textMuted} mt="xs">
            Indian Rupee (Lakh / Crore)
          </Text>
        </Card>
      </SimpleGrid>

      {/* ─────────────────────────────────────────────────────────────
          3. SEARCH & FILTERS
          - Prominent search box always visible
          - Mobile: "Filters" button opens bottom sheet Drawer with badge count
          - Desktop: Full inline filter inputs
          ───────────────────────────────────────────────────────────── */}
      <Paper
        withBorder
        p="xs"
        radius="md"
        mb="sm"
        style={{ backgroundColor: cardBg, borderColor: cardBorder }}
      >
        <Group gap="xs" wrap="nowrap">
          {/* Main Search Input (Always Visible) */}
          <TextInput
            placeholder="Search serial, challan, vehicle, product..."
            leftSection={<IconSearch size={16} color="#94A3B8" />}
            value={searchInput}
            onChange={(e) => setSearchInput(e.currentTarget.value)}
            size="sm"
            style={{ flex: 1 }}
          />

          {/* Mobile Filters Button (with active count badge) */}
          <Box hiddenFrom="sm">
            <Button
              variant={activeFiltersCount > 0 ? "filled" : "light"}
              color="blue"
              size="sm"
              radius="md"
              leftSection={<IconFilter size={16} />}
              onClick={openFilterDrawer}
            >
              Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
            </Button>
          </Box>

          {/* Desktop Clear Filters button if filtered */}
          {isFiltered && (
            <Button
              variant="subtle"
              color="red"
              size="sm"
              visibleFrom="sm"
              leftSection={<IconFilterOff size={14} />}
              onClick={handleClearFilters}
            >
              Clear
            </Button>
          )}
        </Group>

        {/* Desktop Collapsed/Inline Filter Fields */}
        <Box visibleFrom="sm" mt="xs">
          <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="xs">
            <DatePickerInput
              type="range"
              placeholder="Date range (from - to)"
              value={dateRangeValue}
              onChange={(dates) => {
                if (!dates) {
                  updateFilters({ date_from: undefined, date_to: undefined, page: 1 });
                } else {
                  const [start, end] = dates;
                  updateFilters({
                    date_from: start ? dayjs(start).format("YYYY-MM-DD") : undefined,
                    date_to: end ? dayjs(end).format("YYYY-MM-DD") : undefined,
                    page: 1,
                  });
                }
              }}
              clearable
              size="xs"
            />

            <TextInput
              placeholder="Filter by product..."
              value={urlProduct}
              onChange={(e) => updateFilters({ product: e.currentTarget.value, page: 1 })}
              size="xs"
            />

            <TextInput
              placeholder="Filter by destination..."
              value={urlDestination}
              onChange={(e) => updateFilters({ destination: e.currentTarget.value, page: 1 })}
              size="xs"
            />

            <TextInput
              placeholder="Filter by vehicle no..."
              value={urlVehicleNo}
              onChange={(e) => updateFilters({ vehicle_no: e.currentTarget.value, page: 1 })}
              size="xs"
            />
          </SimpleGrid>
        </Box>
      </Paper>

      {/* ─────────────────────────────────────────────────────────────
          4. MOBILE FILTERS BOTTOM SHEET (DRAWER)
          ───────────────────────────────────────────────────────────── */}
      <Drawer
        opened={filterDrawerOpened}
        onClose={closeFilterDrawer}
        position="bottom"
        radius="lg"
        title={
          <Group gap="xs">
            <IconFilter size={20} color="#2563EB" />
            <Text fw={700} size="md">
              Filter Delivery Entries
            </Text>
            {activeFiltersCount > 0 && (
              <Badge color="blue" size="sm">
                {activeFiltersCount} Active
              </Badge>
            )}
          </Group>
        }
        styles={{
          body: {
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
          },
        }}
      >
        <Stack gap="md" mt="xs">
          <DatePickerInput
            type="range"
            label="Date Range"
            placeholder="Select start and end date"
            value={dateRangeValue}
            onChange={(dates) => {
              if (!dates) {
                updateFilters({ date_from: undefined, date_to: undefined, page: 1 });
              } else {
                const [start, end] = dates;
                updateFilters({
                  date_from: start ? dayjs(start).format("YYYY-MM-DD") : undefined,
                  date_to: end ? dayjs(end).format("YYYY-MM-DD") : undefined,
                  page: 1,
                });
              }
            }}
            clearable
            size="md"
          />

          <TextInput
            label="Product Name"
            placeholder="e.g. Steel Rods, Cement..."
            value={urlProduct}
            onChange={(e) => updateFilters({ product: e.currentTarget.value, page: 1 })}
            size="md"
          />

          <TextInput
            label="Destination"
            placeholder="e.g. Delhi, Jaipur, Mumbai..."
            value={urlDestination}
            onChange={(e) => updateFilters({ destination: e.currentTarget.value, page: 1 })}
            size="md"
          />

          <TextInput
            label="Vehicle Number"
            placeholder="e.g. DL01AB1234"
            value={urlVehicleNo}
            onChange={(e) => updateFilters({ vehicle_no: e.currentTarget.value, page: 1 })}
            size="md"
          />

          <Group grow mt="sm">
            <Button
              variant="default"
              size="md"
              leftSection={<IconX size={16} />}
              onClick={handleClearFilters}
              disabled={activeFiltersCount === 0}
            >
              Clear
            </Button>
            <Button color="blue" size="md" onClick={closeFilterDrawer}>
              Show Entries
            </Button>
          </Group>
        </Stack>
      </Drawer>

      {/* ─────────────────────────────────────────────────────────────
          5. MAIN ENTRIES DISPLAY:
          - Mobile (hiddenFrom="sm"): Card-based list
          - Desktop (visibleFrom="sm"): Full 10-column data table
          ───────────────────────────────────────────────────────────── */}

      {/* ── MOBILE CARD LIST VIEW ── */}
      <Box hiddenFrom="sm">
        {entriesQuery.isError ? (
          <Alert icon={<IconAlertCircle size={20} />} title="Error" color="red">
            {(entriesQuery.error as any)?.message || "Failed to load entries."}
          </Alert>
        ) : entriesQuery.isLoading && urlPage === 1 ? (
          // Mobile Skeleton cards
          <Stack gap="xs">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card
                key={i}
                withBorder
                radius="md"
                p="sm"
                style={{ backgroundColor: cardBg, borderColor: cardBorder }}
              >
                <Group justify="space-between" mb={6}>
                  <Skeleton height={20} width="45%" radius="xs" />
                  <Skeleton height={20} width="35%" radius="xs" />
                </Group>
                <Group justify="space-between" mb={6}>
                  <Skeleton height={14} width="30%" radius="xs" />
                  <Skeleton height={14} width="25%" radius="xs" />
                </Group>
                <Skeleton height={14} width="60%" radius="xs" />
              </Card>
            ))}
          </Stack>
        ) : mobileEntries.length === 0 ? (
          // Empty State
          <Paper
            withBorder
            radius="md"
            p="xl"
            ta="center"
            style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          >
            <IconTruckDelivery size={48} color="#94A3B8" stroke={1.5} />
            <Title order={4} fw={700} c={textPrimary} mt="sm">
              No entries found
            </Title>
            <Text size="xs" c={textMuted} mt={4} mb="md">
              {isFiltered
                ? "No entries match your search. Try changing filters."
                : "No delivery records yet. Tap the '+' button below to add one."}
            </Text>
            {isFiltered ? (
              <Button size="xs" variant="light" color="blue" onClick={handleClearFilters}>
                Clear All Filters
              </Button>
            ) : (
              <Button
                size="sm"
                color="blue"
                leftSection={<IconPlus size={16} />}
                onClick={() => {
                  setSelectedEntryForEdit(null);
                  setIsFormModalOpen(true);
                }}
              >
                Add First Entry
              </Button>
            )}
          </Paper>
        ) : (
          <Stack gap="xs">
            {mobileEntries.map((entry) => (
              <Card
                key={entry.id}
                withBorder
                radius="md"
                p="sm"
                style={{
                  backgroundColor: cardBg,
                  borderColor: cardBorder,
                  cursor: "pointer",
                  transition: "transform 0.1s ease, box-shadow 0.1s ease",
                  userSelect: "none",
                }}
                className="mobile-entry-card"
                onClick={() => {
                  setSelectedEntryForEdit(entry);
                  setIsFormModalOpen(true);
                }}
              >
                {/* Line 1: Product Name + Total Price */}
                <Group justify="space-between" align="flex-start" wrap="nowrap" mb={4}>
                  <Text fw={700} size="sm" c={textPrimary} lineClamp={1} style={{ flex: 1 }}>
                    {entry.product}
                  </Text>
                  <Text fw={800} size="md" c="#2563EB" style={{ whiteSpace: "nowrap" }}>
                    {formatIndianCurrency(entry.total_price)}
                  </Text>
                </Group>

                {/* Line 2: Challan No, Vehicle No, Qty & Rate */}
                <Group justify="space-between" align="center" wrap="nowrap" mb={4}>
                  <Group gap={6} wrap="nowrap">
                    <Text size="xs" fw={600} c={textMuted}>
                      {entry.challan_no}
                    </Text>
                    <Badge variant="outline" color="gray" size="xs" ff="monospace">
                      {entry.vehicle_no}
                    </Badge>
                  </Group>

                  <Text size="xs" c={textMuted}>
                    <b>{Number(entry.quantity).toLocaleString("en-IN")}</b> @ {formatIndianCurrency(entry.unit_price)}
                  </Text>
                </Group>

                {/* Line 3: Destination + Date + Menu */}
                <Group justify="space-between" align="center" wrap="nowrap">
                  <Group gap={4} wrap="nowrap" style={{ overflow: "hidden", flex: 1 }}>
                    <IconMapPin size={13} color="#94A3B8" style={{ flexShrink: 0 }} />
                    <Text size="xs" c={textMuted} lineClamp={1}>
                      {entry.destination || "No destination"}
                    </Text>
                    <Text size="xs" c={textMuted}>
                      • {formatDate(entry.created_at)}
                    </Text>
                  </Group>

                  {/* Actions Menu */}
                  <Menu position="bottom-end" shadow="md" width={140} withinPortal>
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Actions"
                      >
                        <IconDotsVertical size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                      <Menu.Item
                        leftSection={<IconEdit size={14} />}
                        onClick={() => {
                          setSelectedEntryForEdit(entry);
                          setIsFormModalOpen(true);
                        }}
                      >
                        Edit
                      </Menu.Item>
                      {isAdmin && (
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => setEntryToDelete(entry)}
                        >
                          Delete
                        </Menu.Item>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </Card>
            ))}

            {/* Infinite scroll sentinel + bottom indicator */}
            <Box ref={infiniteScrollSentinelRef} style={{ height: 1 }} />

            {/* Loading spinner shown while fetching next page */}
            {entriesQuery.isFetching && urlPage > 1 && (
              <Box ta="center" py="sm">
                <Text size="xs" c={textMuted}>Loading more entries…</Text>
              </Box>
            )}

            {!hasMore && entriesQuery.data && entriesQuery.data.total_count > 0 && (
              <Text size="xs" c={textMuted} ta="center" py="xs">
                ✓ All {entriesQuery.data.total_count} entries loaded
              </Text>
            )}
          </Stack>
        )}
      </Box>

      {/* ── DESKTOP TABLE VIEW ── */}
      <Box visibleFrom="sm">
        <Paper
          withBorder
          radius="md"
          style={{
            backgroundColor: cardBg,
            borderColor: cardBorder,
            overflow: "hidden",
          }}
        >
          {entriesQuery.isError ? (
            <Box p="xl">
              <Alert icon={<IconAlertCircle size={20} />} title="Error" color="red">
                {(entriesQuery.error as any)?.message || "Failed to retrieve delivery entries."}
              </Alert>
            </Box>
          ) : (
            <Box style={{ overflowX: "auto" }}>
              <Table
                striped
                highlightOnHover
                verticalSpacing="sm"
                horizontalSpacing="md"
                style={{ minWidth: 900 }}
              >
                <Table.Thead style={{ backgroundColor: isDark ? "#0F172A" : "#F8FAFC" }}>
                  <Table.Tr>
                    <Table.Th style={{ width: 110 }}>
                      <UnstyledButton onClick={() => handleSort("serial_no")} w="100%">
                        <Group justify="space-between" gap={4} wrap="nowrap">
                          <Text size="xs" fw={700} c={urlSortBy === "serial_no" ? "blue.6" : textMuted}>
                            Serial No
                          </Text>
                          {getSortIcon("serial_no")}
                        </Group>
                      </UnstyledButton>
                    </Table.Th>

                    <Table.Th style={{ width: 140 }}>
                      <UnstyledButton onClick={() => handleSort("challan_no")} w="100%">
                        <Group justify="space-between" gap={4} wrap="nowrap">
                          <Text size="xs" fw={700} c={urlSortBy === "challan_no" ? "blue.6" : textMuted}>
                            Challan No
                          </Text>
                          {getSortIcon("challan_no")}
                        </Group>
                      </UnstyledButton>
                    </Table.Th>

                    <Table.Th style={{ width: 130 }}>
                      <UnstyledButton onClick={() => handleSort("vehicle_no")} w="100%">
                        <Group justify="space-between" gap={4} wrap="nowrap">
                          <Text size="xs" fw={700} c={urlSortBy === "vehicle_no" ? "blue.6" : textMuted}>
                            Vehicle No
                          </Text>
                          {getSortIcon("vehicle_no")}
                        </Group>
                      </UnstyledButton>
                    </Table.Th>

                    <Table.Th>
                      <UnstyledButton onClick={() => handleSort("product")} w="100%">
                        <Group justify="space-between" gap={4} wrap="nowrap">
                          <Text size="xs" fw={700} c={urlSortBy === "product" ? "blue.6" : textMuted}>
                            Product
                          </Text>
                          {getSortIcon("product")}
                        </Group>
                      </UnstyledButton>
                    </Table.Th>

                    <Table.Th style={{ minWidth: 140 }}>
                      <UnstyledButton onClick={() => handleSort("destination")} w="100%">
                        <Group justify="space-between" gap={4} wrap="nowrap">
                          <Text size="xs" fw={700} c={urlSortBy === "destination" ? "blue.6" : textMuted}>
                            Destination
                          </Text>
                          {getSortIcon("destination")}
                        </Group>
                      </UnstyledButton>
                    </Table.Th>

                    <Table.Th style={{ width: 100, textAlign: "right" }}>
                      <UnstyledButton onClick={() => handleSort("quantity")} w="100%">
                        <Group justify="flex-end" gap={4} wrap="nowrap">
                          <Text size="xs" fw={700} c={urlSortBy === "quantity" ? "blue.6" : textMuted}>
                            Quantity
                          </Text>
                          {getSortIcon("quantity")}
                        </Group>
                      </UnstyledButton>
                    </Table.Th>

                    <Table.Th style={{ width: 120, textAlign: "right" }}>
                      <UnstyledButton onClick={() => handleSort("unit_price")} w="100%">
                        <Group justify="flex-end" gap={4} wrap="nowrap">
                          <Text size="xs" fw={700} c={urlSortBy === "unit_price" ? "blue.6" : textMuted}>
                            Unit Price
                          </Text>
                          {getSortIcon("unit_price")}
                        </Group>
                      </UnstyledButton>
                    </Table.Th>

                    <Table.Th style={{ width: 140, textAlign: "right" }}>
                      <UnstyledButton onClick={() => handleSort("total_price")} w="100%">
                        <Group justify="flex-end" gap={4} wrap="nowrap">
                          <Text size="xs" fw={700} c={urlSortBy === "total_price" ? "blue.6" : textMuted}>
                            Total Price
                          </Text>
                          {getSortIcon("total_price")}
                        </Group>
                      </UnstyledButton>
                    </Table.Th>

                    <Table.Th style={{ width: 110 }}>
                      <UnstyledButton onClick={() => handleSort("created_at")} w="100%">
                        <Group justify="space-between" gap={4} wrap="nowrap">
                          <Text size="xs" fw={700} c={urlSortBy === "created_at" ? "blue.6" : textMuted}>
                            Date
                          </Text>
                          {getSortIcon("created_at")}
                        </Group>
                      </UnstyledButton>
                    </Table.Th>

                    <Table.Th style={{ width: 80, textAlign: "center" }}>
                      <Text size="xs" fw={700} c={textMuted}>
                        Actions
                      </Text>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>

                <Table.Tbody>
                  {entriesQuery.isLoading ? (
                    Array.from({ length: 8 }).map((_, idx) => (
                      <Table.Tr key={`skeleton-${idx}`}>
                        <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                        <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                        <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                        <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                        <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                        <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                        <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                        <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                        <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                        <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                      </Table.Tr>
                    ))
                  ) : entriesQuery.data?.items?.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={10}>
                        <Box py={50} ta="center">
                          <IconTruckDelivery size={48} color="#94A3B8" stroke={1.5} />
                          <Title order={4} fw={600} c={textPrimary} mt="sm">
                            No delivery entries found
                          </Title>
                          <Text size="sm" c={textMuted} mt={4} mb="md">
                            {isFiltered
                              ? "No entries match your search criteria. Try adjusting or clearing your filters."
                              : "No delivery records in the database yet. Click 'Add Entry' to create one."}
                          </Text>
                          {isFiltered ? (
                            <Button variant="light" color="blue" size="xs" onClick={handleClearFilters}>
                              Clear All Filters
                            </Button>
                          ) : (
                            <Button
                              color="blue"
                              size="xs"
                              leftSection={<IconPlus size={14} />}
                              onClick={() => {
                                setSelectedEntryForEdit(null);
                                setIsFormModalOpen(true);
                              }}
                            >
                              Add First Entry
                            </Button>
                          )}
                        </Box>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    entriesQuery.data?.items.map((entry) => (
                      <Table.Tr key={entry.id}>
                        <Table.Td>
                          <Badge variant="outline" color="gray" size="sm">
                            {entry.serial_no}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text fw={600} size="sm" c={textPrimary}>
                            {entry.challan_no}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" ff="monospace" fw={600} c={textPrimary}>
                            {entry.vehicle_no}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c={textPrimary} fw={500}>
                            {entry.product}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={4} wrap="nowrap">
                            <IconMapPin size={14} color="#64748B" style={{ flexShrink: 0 }} />
                            <Text size="sm" c={textPrimary} fw={500} lineClamp={1} title={entry.destination}>
                              {entry.destination || "—"}
                            </Text>
                          </Group>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="sm" fw={600} c={textPrimary}>
                            {Number(entry.quantity).toLocaleString("en-IN", {
                              maximumFractionDigits: 2,
                            })}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="sm" c={textMuted}>
                            {formatIndianCurrency(entry.unit_price)}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="sm" fw={700} c="#2563EB">
                            {formatIndianCurrency(entry.total_price)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c={textMuted}>
                            {formatDate(entry.created_at)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={4} justify="center" wrap="nowrap">
                            <Tooltip label="Edit entry">
                              <ActionIcon
                                variant="subtle"
                                color="blue"
                                size="sm"
                                onClick={() => {
                                  setSelectedEntryForEdit(entry);
                                  setIsFormModalOpen(true);
                                }}
                              >
                                <IconEdit size={16} />
                              </ActionIcon>
                            </Tooltip>

                            {isAdmin ? (
                              <Tooltip label="Delete entry">
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  size="sm"
                                  onClick={() => setEntryToDelete(entry)}
                                >
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Tooltip>
                            ) : (
                              <Tooltip label="Admin access required to delete entries">
                                <ActionIcon variant="subtle" color="gray" size="sm" disabled>
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Box>
          )}

          {/* Desktop Pagination Footer */}
          {entriesQuery.data && entriesQuery.data.total_count > 0 && (
            <Group
              justify="space-between"
              align="center"
              p="md"
              style={{
                borderTop: `1px solid ${cardBorder}`,
                backgroundColor: isDark ? "#0F172A" : "#FAFAFA",
              }}
              wrap="wrap"
              gap="sm"
            >
              <Group gap="xs">
                <Text size="xs" c={textMuted}>
                  Showing{" "}
                  <b>
                    {(entriesQuery.data.page - 1) * entriesQuery.data.page_size + 1}-
                    {Math.min(
                      entriesQuery.data.page * entriesQuery.data.page_size,
                      entriesQuery.data.total_count
                    )}
                  </b>{" "}
                  of <b>{entriesQuery.data.total_count}</b> entries
                </Text>
                <Select
                  size="xs"
                  w={80}
                  value={String(urlPageSize)}
                  data={["10", "20", "50", "100"]}
                  onChange={(val) => {
                    if (val) updateFilters({ page_size: parseInt(val, 10), page: 1 });
                  }}
                />
                <Text size="xs" c={textMuted}>
                  per page
                </Text>
              </Group>

              <Pagination
                total={entriesQuery.data.total_pages}
                value={entriesQuery.data.page}
                onChange={(newPage) => updateFilters({ page: newPage })}
                size="sm"
                radius="md"
                color="blue"
              />
            </Group>
          )}
        </Paper>
      </Box>

      {/* ─────────────────────────────────────────────────────────────
          6. MODALS
          ───────────────────────────────────────────────────────────── */}
      <EntryFormModal
        opened={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        entryToEdit={selectedEntryForEdit}
      />

      <DeleteConfirmModal
        opened={Boolean(entryToDelete)}
        onClose={() => setEntryToDelete(null)}
        entry={entryToDelete}
      />
    </Box>
  );
};
