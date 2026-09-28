import React, { useState } from "react";
import {
  Box,
  Paper,
  Title,
  Text,
  Group,
  Stack,
  Badge,
  Select,
  Pagination,
  Skeleton,
  SimpleGrid,
  Button,
  Card,
  Collapse,
  useMantineColorScheme,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconHistory,
  IconFilter,
  IconFilterOff,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import dayjs from "dayjs";

import { fetchAuditLogsApi, type AuditLogFilters } from "../api/audit";

// ─── Types ───────────────────────────────────────────────────────────────────
interface AuditLog {
  id: number;
  created_at: string;
  user_name?: string;
  user_email?: string;
  action: string;
  entry_id?: number | null;
  details?: Record<string, any> | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
  import: "Bulk Import",
  export: "Export",
  login: "Login",
  deactivate: "Deactivate User",
  hard_delete: "Hard Delete",
};

const ACTION_COLORS: Record<string, string> = {
  create: "green",
  update: "blue",
  delete: "red",
  import: "violet",
  export: "teal",
  login: "gray",
  deactivate: "orange",
  hard_delete: "red",
};

function getActionBadge(action: string) {
  const key = action.toLowerCase();
  const label = ACTION_LABELS[key] ?? action.replace(/_/g, " ").toUpperCase();
  const color = ACTION_COLORS[key] ?? "gray";
  return (
    <Badge color={color} variant="light" size="sm" style={{ textTransform: "none", fontWeight: 700 }}>
      {label}
    </Badge>
  );
}

function formatTimestamp(iso: string) {
  try {
    return dayjs(iso).format("DD/MM/YYYY HH:mm:ss");
  } catch {
    return iso;
  }
}

/** Render the details JSON in a readable key: value list */
function DetailsView({ details }: { details?: Record<string, any> | null }) {
  const [opened, { toggle }] = useDisclosure(false);
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  if (!details || Object.keys(details).length === 0) {
    return (
      <Text size="xs" c={isDark ? "#64748B" : "#94A3B8"} fs="italic">
        No details
      </Text>
    );
  }

  const entries = Object.entries(details);
  const previewCount = 3;
  const hasMore = entries.length > previewCount;

  const renderEntry = ([key, value]: [string, any]) => {
    const displayKey = key.replace(/_/g, " ");
    const displayVal =
      value === null || value === undefined
        ? "—"
        : typeof value === "object"
        ? JSON.stringify(value, null, 2)
        : String(value);

    return (
      <Group key={key} gap={6} align="flex-start" wrap="nowrap">
        <Text size="xs" fw={600} c={isDark ? "#94A3B8" : "#64748B"} style={{ whiteSpace: "nowrap", minWidth: 80 }}>
          {displayKey}:
        </Text>
        <Text
          size="xs"
          c={isDark ? "#CBD5E1" : "#334155"}
          style={{
            wordBreak: "break-all",
            fontFamily: typeof value === "object" ? "monospace" : undefined,
            whiteSpace: typeof value === "object" ? "pre-wrap" : undefined,
          }}
        >
          {displayVal}
        </Text>
      </Group>
    );
  };

  return (
    <Box>
      <Stack gap={2}>
        {entries.slice(0, previewCount).map(renderEntry)}
      </Stack>
      {hasMore && (
        <>
          <Collapse expanded={opened}>
            <Stack gap={2} mt={2}>
              {entries.slice(previewCount).map(renderEntry)}
            </Stack>
          </Collapse>
          <Button
            variant="subtle"
            color="blue"
            size="compact-xs"
            mt={4}
            rightSection={opened ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
            onClick={toggle}
            style={{ padding: "2px 6px", height: "auto" }}
          >
            {opened ? "Show less" : `+${entries.length - previewCount} more`}
          </Button>
        </>
      )}
    </Box>
  );
}

// ─── Mobile card for one log row ──────────────────────────────────────────────
const AuditLogCard: React.FC<{ log: AuditLog }> = ({ log }) => {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const cardBg = isDark ? "#1E293B" : "#FFFFFF";
  const cardBorder = isDark ? "#334155" : "#E2E8F0";

  return (
    <Card withBorder radius="md" p="sm" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
      {/* Top row: action badge + timestamp */}
      <Group justify="space-between" align="flex-start" mb={6} wrap="nowrap">
        {getActionBadge(log.action)}
        <Text size="xs" c={isDark ? "#94A3B8" : "#64748B"} ff="monospace" style={{ whiteSpace: "nowrap" }}>
          {formatTimestamp(log.created_at)}
        </Text>
      </Group>

      {/* User info */}
      <Group gap={6} mb={4} align="flex-start">
        <Text size="xs" fw={700} c={isDark ? "#F8FAFC" : "#0F172A"}>
          {log.user_name || "System"}
        </Text>
        {log.user_email && (
          <Text size="xs" c={isDark ? "#94A3B8" : "#64748B"}>
            ({log.user_email})
          </Text>
        )}
      </Group>

      {/* Entry ID (if any) */}
      {log.entry_id && (
        <Group gap={6} mb={4}>
          <Text size="xs" c={isDark ? "#94A3B8" : "#64748B"}>Entry:</Text>
          <Badge size="xs" variant="outline" color="gray">#{log.entry_id}</Badge>
        </Group>
      )}

      {/* Details */}
      <Box
        mt={4}
        p="xs"
        style={{
          backgroundColor: isDark ? "#0F172A" : "#F8FAFC",
          borderRadius: 6,
          border: `1px solid ${isDark ? "#334155" : "#E2E8F0"}`,
        }}
      >
        <DetailsView details={log.details} />
      </Box>
    </Card>
  );
};

// ─── Desktop table row for one log ───────────────────────────────────────────
const AuditLogTableRow: React.FC<{ log: AuditLog }> = ({ log }) => {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <tr>
      <td style={{ padding: "8px 12px" }}>
        <Text size="xs" c={isDark ? "#94A3B8" : "#64748B"}>#{log.id}</Text>
      </td>
      <td style={{ padding: "8px 12px" }}>
        <Text size="xs" ff="monospace" c={isDark ? "#CBD5E1" : "#334155"} style={{ whiteSpace: "nowrap" }}>
          {formatTimestamp(log.created_at)}
        </Text>
      </td>
      <td style={{ padding: "8px 12px", minWidth: 160 }}>
        <Text size="xs" fw={600} c={isDark ? "#F8FAFC" : "#0F172A"}>
          {log.user_name || "System"}
        </Text>
        {log.user_email && (
          <Text size="xs" c={isDark ? "#94A3B8" : "#64748B"} style={{ wordBreak: "break-word" }}>
            {log.user_email}
          </Text>
        )}
      </td>
      <td style={{ padding: "8px 12px", minWidth: 130 }}>
        {getActionBadge(log.action)}
      </td>
      <td style={{ padding: "8px 12px" }}>
        {log.entry_id ? (
          <Badge size="xs" variant="outline" color="gray">#{log.entry_id}</Badge>
        ) : (
          <Text size="xs" c={isDark ? "#475569" : "#94A3B8"}>—</Text>
        )}
      </td>
      <td style={{ padding: "8px 12px", maxWidth: 320 }}>
        <DetailsView details={log.details} />
      </td>
    </tr>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export const AuditLogsPage: React.FC = () => {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const isMobile = useMediaQuery("(max-width: 48em)");

  const cardBg = isDark ? "#1E293B" : "#FFFFFF";
  const cardBorder = isDark ? "#334155" : "#E2E8F0";
  const textPrimary = isDark ? "#F8FAFC" : "#0F172A";

  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const currentFilters: AuditLogFilters = {
    action: actionFilter || undefined,
    date_from: dateRange[0] ? dayjs(dateRange[0]).format("YYYY-MM-DD") : undefined,
    date_to: dateRange[1] ? dayjs(dateRange[1]).format("YYYY-MM-DD") : undefined,
    page,
    page_size: pageSize,
  };

  const auditQuery = useQuery({
    queryKey: ["audit-logs", currentFilters],
    queryFn: () => fetchAuditLogsApi(currentFilters),
    placeholderData: (prev) => prev,
  });

  const handleClearFilters = () => {
    setActionFilter(null);
    setDateRange([null, null]);
    setPage(1);
  };

  const isFiltered = Boolean(actionFilter || dateRange[0] || dateRange[1]);

  return (
    <Box py="md">
      {/* Header Bar */}
      <Group justify="space-between" align="center" mb="lg" wrap="wrap" gap="md">
        <Box>
          <Title order={1} size="h2" fw={800} c={textPrimary}>
            Security & Audit Trail
          </Title>
          <Text size="sm" c="#64748B">
            Immutable log of all user actions, delivery modifications, imports, and exports
          </Text>
        </Box>
      </Group>

      {/* Filter Bar */}
      <Paper
        withBorder
        p="md"
        radius="md"
        mb="md"
        style={{ backgroundColor: cardBg, borderColor: cardBorder }}
      >
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <IconFilter size={18} color="#2563EB" />
              <Text fw={600} size="sm" c={textPrimary}>
                Audit Log Filters
              </Text>
            </Group>
            {isFiltered && (
              <Button
                variant="subtle"
                color="red"
                size="xs"
                leftSection={<IconFilterOff size={14} />}
                onClick={handleClearFilters}
              >
                Clear Filters
              </Button>
            )}
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Select
              placeholder="Filter by action type..."
              clearable
              value={actionFilter}
              onChange={(val) => {
                setActionFilter(val);
                setPage(1);
              }}
              data={[
                { value: "create", label: "Create (Delivery Entry)" },
                { value: "update", label: "Update (Delivery Entry)" },
                { value: "delete", label: "Delete (Soft-delete)" },
                { value: "import", label: "Bulk Import (Excel/CSV)" },
                { value: "export", label: "Export (Excel/CSV)" },
                { value: "login", label: "Login" },
                { value: "deactivate", label: "Deactivate User" },
              ]}
              size="sm"
            />

            <DatePickerInput
              type="range"
              placeholder="Date range (from – to)"
              value={dateRange}
              onChange={(dates) => {
                setDateRange((dates as [Date | null, Date | null]) || [null, null]);
                setPage(1);
              }}
              clearable
              size="sm"
            />
          </SimpleGrid>
        </Stack>
      </Paper>

      {/* Logs Content */}
      <Paper
        withBorder
        radius="md"
        style={{ backgroundColor: cardBg, borderColor: cardBorder, overflow: "hidden" }}
      >
        {/* Header row */}
        <Box p="md" style={{ borderBottom: `1px solid ${cardBorder}` }}>
          <Group justify="space-between">
            <Group gap="xs">
              <IconHistory size={18} color="#2563EB" />
              <Text fw={700} size="sm" c={textPrimary}>
                Activity Records
              </Text>
            </Group>
            {auditQuery.data && (
              <Text size="xs" c="#64748B">
                Total: <b>{auditQuery.data.total_count}</b> logged actions
              </Text>
            )}
          </Group>
        </Box>

        {/* Mobile: card list */}
        {isMobile ? (
          <Box p="sm">
            {auditQuery.isLoading ? (
              <Stack gap="xs">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} height={100} radius="md" />
                ))}
              </Stack>
            ) : auditQuery.data?.items?.length === 0 ? (
              <Box py={40} ta="center">
                <IconHistory size={40} color="#94A3B8" />
                <Text size="sm" c="#64748B" mt="xs">
                  No audit records match the current filters.
                </Text>
              </Box>
            ) : (
              <Stack gap="xs">
                {(auditQuery.data?.items as AuditLog[] ?? []).map((log) => (
                  <AuditLogCard key={log.id} log={log} />
                ))}
              </Stack>
            )}
          </Box>
        ) : (
          /* Desktop: table */
          <Box style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead
                style={{
                  backgroundColor: isDark ? "#0F172A" : "#F8FAFC",
                  borderBottom: `1px solid ${cardBorder}`,
                }}
              >
                <tr>
                  <th style={{ padding: "10px 12px", textAlign: "left", width: 55, color: isDark ? "#94A3B8" : "#64748B", fontWeight: 700 }}>ID</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", width: 160, color: isDark ? "#94A3B8" : "#64748B", fontWeight: 700 }}>Timestamp</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: isDark ? "#94A3B8" : "#64748B", fontWeight: 700 }}>User</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", width: 150, color: isDark ? "#94A3B8" : "#64748B", fontWeight: 700 }}>Action</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", width: 90, color: isDark ? "#94A3B8" : "#64748B", fontWeight: 700 }}>Entry ID</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: isDark ? "#94A3B8" : "#64748B", fontWeight: 700 }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditQuery.isLoading ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={`skel-${idx}`}>
                      {Array.from({ length: 6 }).map((_, c) => (
                        <td key={c} style={{ padding: "8px 12px" }}>
                          <Skeleton height={20} radius="xs" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : auditQuery.data?.items?.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "40px" }}>
                      <Box py={20} ta="center">
                        <IconHistory size={40} color="#94A3B8" />
                        <Text size="sm" c="#64748B" mt="xs">
                          No audit records match the current filters.
                        </Text>
                      </Box>
                    </td>
                  </tr>
                ) : (
                  (auditQuery.data?.items as AuditLog[] ?? []).map((log) => (
                    <AuditLogTableRow key={log.id} log={log} />
                  ))
                )}
              </tbody>
            </table>
          </Box>
        )}

        {/* Pagination footer */}
        {auditQuery.data && auditQuery.data.total_count > 0 && (
          <Group
            justify="space-between"
            align="center"
            p="md"
            style={{
              borderTop: `1px solid ${cardBorder}`,
              backgroundColor: isDark ? "#0F172A" : "#FAFAFA",
            }}
          >
            <Text size="xs" c="#64748B">
              Page <b>{auditQuery.data.page}</b> of <b>{auditQuery.data.total_pages}</b>
              {" "}({auditQuery.data.total_count} total)
            </Text>
            <Pagination
              total={auditQuery.data.total_pages}
              value={auditQuery.data.page}
              onChange={(newPage) => setPage(newPage)}
              size="sm"
              radius="md"
              color="blue"
            />
          </Group>
        )}
      </Paper>
    </Box>
  );
};
