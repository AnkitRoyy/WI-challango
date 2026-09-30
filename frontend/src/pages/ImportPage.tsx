import React, { useState } from "react";
import {
  Box,
  Paper,
  Title,
  Text,
  Group,
  Stack,
  Button,
  Table,
  Badge,
  SimpleGrid,
  Card,
  Radio,
  FileInput,
  Progress,
  Accordion,
  Menu,
  useMantineColorScheme,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconDownload,
  IconUpload,
  IconFileSpreadsheet,
  IconCheck,
  IconAlertCircle,
  IconAlertTriangle,
  IconInfoCircle,
  IconArrowRight,
  IconRefresh,
  IconMapPin,
  IconChevronDown,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import {
  downloadImportTemplateApi,
  previewImportApi,
  commitImportApi,
  type ImportPreviewResponse,
  type ImportCommitResponse,
  type RowStatus,
} from "../api/import";
import { formatIndianCurrency } from "../utils/formatters";

export const ImportPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  // Template download state
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Preview state
  const [previewData, setPreviewData] = useState<ImportPreviewResponse | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "update">("skip");

  // Post-commit result state
  const [commitResult, setCommitResult] = useState<ImportCommitResponse | null>(null);

  // Download template handler
  const handleDownloadTemplate = async (format: "csv" | "xlsx" = "csv") => {
    setIsDownloadingTemplate(true);
    try {
      const { blob, filename } = await downloadImportTemplateApi(format);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      notifications.show({
        title: "Template Downloaded",
        message: `Use this ${format.toUpperCase()} template to format delivery records before importing.`,
        color: "green",
        icon: <IconCheck size={18} />,
      });
    } catch (err: any) {
      notifications.show({
        title: "Download Failed",
        message: err?.response?.data?.detail || "Could not download import template.",
        color: "red",
        icon: <IconAlertCircle size={18} />,
      });
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      return await previewImportApi(file);
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setCommitResult(null);
      const validCount = data.ok_count + data.warning_count;
      notifications.show({
        title: "File Analyzed",
        message: `Parsed ${data.total_rows} rows: ${validCount} valid, ${data.duplicate_count} duplicates, ${data.error_count} errors.`,
        color: data.error_count > 0 ? "orange" : "blue",
        icon: <IconInfoCircle size={18} />,
      });
    },
    onError: (err: any) => {
      notifications.show({
        title: "Preview Failed",
        message: err?.response?.data?.detail || "Failed to parse import file.",
        color: "red",
        icon: <IconAlertCircle size={18} />,
      });
    },
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!previewData) throw new Error("No preview data available.");
      return await commitImportApi({
        preview_id: previewData.preview_id,
        duplicate_strategy: duplicateStrategy,
      });
    },
    onSuccess: (res) => {
      setCommitResult(res);
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["entries-summary"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });

      notifications.show({
        title: "Import Successful",
        message: `Committed: ${res.inserted} inserted, ${res.updated} updated, ${res.skipped} skipped.`,
        color: "green",
        icon: <IconCheck size={18} />,
        autoClose: 6000,
      });
    },
    onError: (err: any) => {
      notifications.show({
        title: "Import Commit Failed",
        message: err?.response?.data?.detail || "An error occurred during database commit.",
        color: "red",
        icon: <IconAlertCircle size={18} />,
      });
    },
  });

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file);
    setPreviewData(null);
    setCommitResult(null);
  };

  const handleStartUpload = () => {
    if (!selectedFile) return;
    if (selectedFile.size > 10 * 1024 * 1024) {
      notifications.show({
        title: "File Too Large",
        message: "Maximum allowed file size is 10 MB.",
        color: "red",
        icon: <IconAlertCircle size={18} />,
      });
      return;
    }
    previewMutation.mutate(selectedFile);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setCommitResult(null);
  };

  const getStatusBadge = (status: RowStatus) => {
    switch (status) {
      case "ok":
        return <Badge color="green" variant="light">Valid</Badge>;
      case "warning":
        return <Badge color="yellow" variant="light">Warning</Badge>;
      case "duplicate":
        return <Badge color="blue" variant="light">Duplicate</Badge>;
      case "error":
        return <Badge color="red" variant="filled">Error</Badge>;
    }
  };

  const cardBg = isDark ? "#1E293B" : "#FFFFFF";
  const cardBorder = isDark ? "#334155" : "#E2E8F0";
  const textPrimary = isDark ? "#F8FAFC" : "#0F172A";
  const textMuted = isDark ? "#94A3B8" : "#64748B";

  // Filter rows by status for mobile collapsible sections
  const errorRows = previewData ? previewData.rows.filter((r) => r.status === "error") : [];
  const warningRows = previewData ? previewData.rows.filter((r) => r.status === "warning") : [];
  const duplicateRows = previewData ? previewData.rows.filter((r) => r.status === "duplicate") : [];
  const readyRows = previewData ? previewData.rows.filter((r) => r.status === "ok") : [];

  return (
    <Box py="sm">
      {/* Header Bar */}
      <Group justify="space-between" align="center" mb="sm" wrap="wrap" gap="xs">
        <Box>
          <Title order={1} size="h3" fw={800} c={textPrimary}>
            Bulk Delivery Import
          </Title>
          <Text size="xs" c={textMuted}>
            Upload Excel (.xlsx) or CSV files with delivery records for preview and database sync
          </Text>
        </Box>

        <Menu shadow="md" width={220} position="bottom-end">
          <Menu.Target>
            <Button
              variant="outline"
              color="blue"
              size="sm"
              radius="md"
              leftSection={<IconDownload size={16} />}
              rightSection={<IconChevronDown size={14} />}
              loading={isDownloadingTemplate}
            >
              Download Template
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconFileSpreadsheet size={16} color="#10B981" />}
              onClick={() => handleDownloadTemplate("csv")}
            >
              CSV Template (.csv)
            </Menu.Item>
            <Menu.Item
              leftSection={<IconFileSpreadsheet size={16} color="#3B82F6" />}
              onClick={() => handleDownloadTemplate("xlsx")}
            >
              Excel Template (.xlsx)
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {/* Post-Commit Result Card */}
      {commitResult && (
        <Paper
          withBorder
          p="md"
          radius="md"
          mb="md"
          style={{
            backgroundColor: isDark ? "#064E3B" : "#F0FDF4",
            borderColor: isDark ? "#059669" : "#86EFAC",
          }}
        >
          <Stack gap="sm">
            <Group justify="space-between" align="center" wrap="wrap">
              <Group gap="sm">
                <Box
                  p={6}
                  style={{
                    backgroundColor: "#22C55E",
                    borderRadius: "50%",
                    color: "white",
                    display: "flex",
                  }}
                >
                  <IconCheck size={20} />
                </Box>
                <Box>
                  <Title order={3} size="h4" fw={700} c={isDark ? "#D1FAE5" : "#14532D"}>
                    Import Completed Successfully
                  </Title>
                  <Text size="xs" c={isDark ? "#A7F3D0" : "#166534"}>
                    {commitResult.message || "Records saved into the database in an atomic transaction."}
                  </Text>
                </Box>
              </Group>

              <Group gap="xs">
                <Button
                  variant="default"
                  size="xs"
                  radius="md"
                  onClick={handleReset}
                  leftSection={<IconRefresh size={14} />}
                >
                  Import Another
                </Button>
                <Button
                  color="green"
                  size="xs"
                  radius="md"
                  rightSection={<IconArrowRight size={14} />}
                  onClick={() => navigate("/entries")}
                >
                  View All Entries
                </Button>
              </Group>
            </Group>

            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
              <Card withBorder radius="md" p="xs" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
                <Text size="10px" fw={700} c={textMuted} tt="uppercase">Inserted</Text>
                <Text size="lg" fw={800} c="#16A34A">{commitResult.inserted}</Text>
                <Text size="10px" c={textMuted}>New delivery rows</Text>
              </Card>

              <Card withBorder radius="md" p="xs" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
                <Text size="10px" fw={700} c={textMuted} tt="uppercase">Updated</Text>
                <Text size="lg" fw={800} c="#2563EB">{commitResult.updated}</Text>
                <Text size="10px" c={textMuted}>Overwritten duplicates</Text>
              </Card>

              <Card withBorder radius="md" p="xs" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
                <Text size="10px" fw={700} c={textMuted} tt="uppercase">Skipped</Text>
                <Text size="lg" fw={800} c="#D97706">{commitResult.skipped}</Text>
                <Text size="10px" c={textMuted}>Existing records preserved</Text>
              </Card>

              <Card withBorder radius="md" p="xs" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
                <Text size="10px" fw={700} c={textMuted} tt="uppercase">Failed</Text>
                <Text size="lg" fw={800} c="#DC2626">{commitResult.failed}</Text>
                <Text size="10px" c={textMuted}>Invalid rows dropped</Text>
              </Card>
            </SimpleGrid>
          </Stack>
        </Paper>
      )}

      {/* File Upload Zone (shown when not yet committed) */}
      {!commitResult && (
        <Paper withBorder p="md" radius="md" mb="md" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <Box>
                <Text fw={700} size="sm" c={textPrimary}>
                  Upload Challan Spreadsheet
                </Text>
                <Text size="xs" c={textMuted}>
                  Select an .xlsx or .csv file (Max 10 MB, up to 10,000 data rows).
                </Text>
              </Box>

              {previewData && (
                <Button variant="subtle" color="gray" size="xs" onClick={handleReset}>
                  Clear Selection
                </Button>
              )}
            </Group>

            <Group align="flex-end" grow wrap="wrap">
              <FileInput
                placeholder="Choose .xlsx or .csv file..."
                accept=".xlsx,.csv"
                value={selectedFile}
                onChange={handleFileChange}
                leftSection={<IconFileSpreadsheet size={18} color="#2563EB" />}
                clearable
                size="sm"
                style={{ minWidth: 220 }}
              />
              <Button
                color="blue"
                size="sm"
                radius="md"
                style={{ flexGrow: 0, minWidth: 150 }}
                leftSection={<IconUpload size={16} />}
                disabled={!selectedFile}
                loading={previewMutation.isPending}
                onClick={handleStartUpload}
              >
                Upload & Preview
              </Button>
            </Group>

            {previewMutation.isPending && (
              <Stack gap="xs" mt="xs">
                <Text size="xs" c={textMuted}>
                  Parsing spreadsheet, calculating valuations, and checking database duplicates...
                </Text>
                <Progress value={100} animated striped color="blue" />
              </Stack>
            )}
          </Stack>
        </Paper>
      )}

      {/* Preview Section */}
      {previewData && !commitResult && (
        <Stack gap="md">
          {/* Summary Badges Bar */}
          <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="xs">
            <Card withBorder radius="md" p="xs" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <Text size="10px" fw={700} c={textMuted} tt="uppercase">Total Rows</Text>
              <Text size="md" fw={800} c={textPrimary}>{previewData.total_rows}</Text>
            </Card>

            <Card withBorder radius="md" p="xs" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <Text size="10px" fw={700} c="#16A34A" tt="uppercase">Valid Rows</Text>
              <Text size="md" fw={800} c="#16A34A">{previewData.ok_count}</Text>
            </Card>

            <Card withBorder radius="md" p="xs" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <Text size="10px" fw={700} c="#2563EB" tt="uppercase">Duplicates</Text>
              <Text size="md" fw={800} c="#2563EB">{previewData.duplicate_count}</Text>
            </Card>

            <Card withBorder radius="md" p="xs" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <Text size="10px" fw={700} c="#D97706" tt="uppercase">Warnings</Text>
              <Text size="md" fw={800} c="#D97706">{previewData.warning_count}</Text>
            </Card>

            <Card withBorder radius="md" p="xs" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <Text size="10px" fw={700} c="#DC2626" tt="uppercase">Errors</Text>
              <Text size="md" fw={800} c="#DC2626">{previewData.error_count}</Text>
            </Card>
          </SimpleGrid>

          {/* Strategy & Commit Action Controls */}
          <Paper withBorder p="md" radius="md" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
            <Group justify="space-between" align="center" wrap="wrap" gap="md">
              <Box>
                <Text fw={700} size="sm" c={textPrimary} mb={4}>
                  Duplicate Resolution Strategy
                </Text>
                <Radio.Group
                  value={duplicateStrategy}
                  onChange={(val) => setDuplicateStrategy(val as "skip" | "update")}
                >
                  <Group gap="md">
                    <Radio
                      value="skip"
                      label="Skip Duplicates"
                      size="sm"
                    />
                    <Radio
                      value="update"
                      label="Update Duplicates"
                      size="sm"
                    />
                  </Group>
                </Radio.Group>
              </Box>

              <Group gap="sm">
                <Button variant="default" size="sm" onClick={handleReset} disabled={commitMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  color="blue"
                  size="sm"
                  radius="md"
                  loading={commitMutation.isPending}
                  disabled={previewData.ok_count + previewData.warning_count + previewData.duplicate_count === 0}
                  onClick={() => commitMutation.mutate()}
                  leftSection={<IconCheck size={16} />}
                >
                  Commit ({duplicateStrategy === "skip" ? previewData.ok_count + previewData.warning_count : previewData.ok_count + previewData.warning_count + previewData.duplicate_count} Rows)
                </Button>
              </Group>
            </Group>
          </Paper>

          {/* ── MOBILE COLLAPSIBLE STATUS SECTIONS (hiddenFrom="sm") ── */}
          <Box hiddenFrom="sm">
            <Accordion
              multiple
              defaultValue={["errors", "warnings", "duplicates", "ready"]}
              variant="separated"
              radius="md"
            >
              {/* 1. Errors Section */}
              {errorRows.length > 0 && (
                <Accordion.Item value="errors" style={{ backgroundColor: cardBg, borderColor: "#FCA5A5" }}>
                  <Accordion.Control icon={<IconAlertCircle size={18} color="#DC2626" />}>
                    <Group justify="space-between" pr="xs">
                      <Text fw={700} size="sm" c="#DC2626">
                        {errorRows.length} Errors (Cannot Import)
                      </Text>
                      <Badge color="red" size="xs">
                        Blocker
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="xs">
                      {errorRows.map((r) => {
                        const d = r.data || {};
                        return (
                          <Card key={r.row_number} withBorder radius="sm" p="xs" style={{ borderColor: "#FECACA" }}>
                            <Group justify="space-between" mb={2}>
                              <Text size="xs" fw={700} c={textPrimary}>
                                Row #{r.row_number}: {d.product || "Unknown Product"}
                              </Text>
                              <Badge color="red" size="xs">Error</Badge>
                            </Group>
                            <Text size="xs" c={textMuted} mb={4}>
                              Challan: {d.challan_no || "-"} • Vehicle: {d.vehicle_no || "-"}
                            </Text>
                            {r.messages && r.messages.length > 0 && (
                              <Paper p={6} radius="xs" bg={isDark ? "#450A0A" : "#FEF2F2"}>
                                <Text size="11px" c="#DC2626" fw={600}>
                                  {r.messages.join("; ")}
                                </Text>
                              </Paper>
                            )}
                          </Card>
                        );
                      })}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* 2. Warnings Section */}
              {warningRows.length > 0 && (
                <Accordion.Item value="warnings" style={{ backgroundColor: cardBg, borderColor: "#FCD34D" }}>
                  <Accordion.Control icon={<IconAlertTriangle size={18} color="#D97706" />}>
                    <Group justify="space-between" pr="xs">
                      <Text fw={700} size="sm" c="#D97706">
                        {warningRows.length} Warnings (Importable)
                      </Text>
                      <Badge color="yellow" size="xs">
                        Review
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="xs">
                      {warningRows.map((r) => {
                        const d = r.data || {};
                        return (
                          <Card key={r.row_number} withBorder radius="sm" p="xs" style={{ borderColor: "#FDE68A" }}>
                            <Group justify="space-between" mb={2}>
                              <Text size="xs" fw={700} c={textPrimary}>
                                Row #{r.row_number}: {d.product || "Unknown"}
                              </Text>
                              <Text size="xs" fw={700} c="#2563EB">
                                {formatIndianCurrency(d.total_price)}
                              </Text>
                            </Group>
                            <Text size="xs" c={textMuted} mb={4}>
                              Challan: {d.challan_no || "-"} • Vehicle: {d.vehicle_no || "-"}
                            </Text>
                            {r.messages && r.messages.length > 0 && (
                              <Paper p={6} radius="xs" bg={isDark ? "#451A03" : "#FFFBEB"}>
                                <Text size="11px" c="#D97706" fw={600}>
                                  {r.messages.join("; ")}
                                </Text>
                              </Paper>
                            )}
                          </Card>
                        );
                      })}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* 3. Duplicates Section */}
              {duplicateRows.length > 0 && (
                <Accordion.Item value="duplicates" style={{ backgroundColor: cardBg, borderColor: "#93C5FD" }}>
                  <Accordion.Control icon={<IconInfoCircle size={18} color="#2563EB" />}>
                    <Group justify="space-between" pr="xs">
                      <Text fw={700} size="sm" c="#2563EB">
                        {duplicateRows.length} Duplicates ({duplicateStrategy === "skip" ? "Will Skip" : "Will Update"})
                      </Text>
                      <Badge color="blue" size="xs">
                        Duplicate
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="xs">
                      {duplicateRows.map((r) => {
                        const d = r.data || {};
                        return (
                          <Card key={r.row_number} withBorder radius="sm" p="xs" style={{ borderColor: "#BFDBFE" }}>
                            <Group justify="space-between" mb={2}>
                              <Text size="xs" fw={700} c={textPrimary}>
                                Row #{r.row_number}: {d.product || "Unknown"}
                              </Text>
                              <Text size="xs" fw={700} c="#2563EB">
                                {formatIndianCurrency(d.total_price)}
                              </Text>
                            </Group>
                            <Text size="xs" c={textMuted}>
                              Challan: {d.challan_no || "-"} • Vehicle: {d.vehicle_no || "-"}
                            </Text>
                          </Card>
                        );
                      })}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* 4. Ready to Import Section */}
              {readyRows.length > 0 && (
                <Accordion.Item value="ready" style={{ backgroundColor: cardBg, borderColor: "#86EFAC" }}>
                  <Accordion.Control icon={<IconCheck size={18} color="#16A34A" />}>
                    <Group justify="space-between" pr="xs">
                      <Text fw={700} size="sm" c="#16A34A">
                        {readyRows.length} Ready to Import
                      </Text>
                      <Badge color="green" size="xs">
                        Clean
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="xs">
                      {readyRows.map((r) => {
                        const d = r.data || {};
                        return (
                          <Card key={r.row_number} withBorder radius="sm" p="xs" style={{ borderColor: "#BBF7D0" }}>
                            <Group justify="space-between" mb={2}>
                              <Text size="xs" fw={700} c={textPrimary}>
                                Row #{r.row_number}: {d.product || "Unknown"}
                              </Text>
                              <Text size="xs" fw={700} c="#16A34A">
                                {formatIndianCurrency(d.total_price)}
                              </Text>
                            </Group>
                            <Text size="xs" c={textMuted}>
                              Challan: {d.challan_no || "-"} • Vehicle: {d.vehicle_no || "-"} • Qty: {d.quantity}
                            </Text>
                          </Card>
                        );
                      })}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              )}
            </Accordion>
          </Box>

          {/* ── DESKTOP PREVIEW TABLE (visibleFrom="sm") ── */}
          <Box visibleFrom="sm">
            <Paper withBorder radius="md" style={{ backgroundColor: cardBg, borderColor: cardBorder, overflow: "hidden" }}>
              <Box p="sm" style={{ borderBottom: `1px solid ${cardBorder}` }}>
                <Group justify="space-between">
                  <Text fw={700} size="sm" c={textPrimary}>
                    Preview Rows Verification Table
                  </Text>
                  <Text size="xs" c={textMuted}>
                    Showing {previewData.rows.length} rows parsed from file
                  </Text>
                </Group>
              </Box>

              <Box style={{ overflowX: "auto" }}>
                <Table
                  striped
                  highlightOnHover
                  verticalSpacing="xs"
                  horizontalSpacing="sm"
                  style={{ minWidth: 950 }}
                >
                  <Table.Thead style={{ backgroundColor: isDark ? "#0F172A" : "#F8FAFC" }}>
                    <Table.Tr>
                      <Table.Th style={{ width: 60 }}>#</Table.Th>
                      <Table.Th style={{ width: 100 }}>Status</Table.Th>
                      <Table.Th style={{ width: 130 }}>Challan No</Table.Th>
                      <Table.Th style={{ width: 120 }}>Vehicle No</Table.Th>
                      <Table.Th>Product</Table.Th>
                      <Table.Th>Destination</Table.Th>
                      <Table.Th style={{ textAlign: "right", width: 90 }}>Qty</Table.Th>
                      <Table.Th style={{ textAlign: "right", width: 110 }}>Unit Price</Table.Th>
                      <Table.Th style={{ textAlign: "right", width: 120 }}>Total Price</Table.Th>
                      <Table.Th style={{ width: 220 }}>Notes / Issues</Table.Th>
                    </Table.Tr>
                  </Table.Thead>

                  <Table.Tbody>
                    {previewData.rows.map((row) => {
                      const rowData = row.data || {};
                      return (
                        <Table.Tr
                          key={row.row_number}
                          bg={
                            row.status === "error"
                              ? isDark ? "#450A0A" : "#FEF2F2"
                              : row.status === "duplicate"
                              ? isDark ? "#1E3A8A" : "#F0F9FF"
                              : undefined
                          }
                        >
                          <Table.Td>
                            <Text size="xs" c={textMuted}>
                              {row.row_number}
                            </Text>
                          </Table.Td>
                          <Table.Td>{getStatusBadge(row.status)}</Table.Td>
                          <Table.Td>
                            <Text size="xs" fw={600} c={textPrimary}>
                              {rowData.challan_no || "-"}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" ff="monospace" fw={600} c={textPrimary}>
                              {rowData.vehicle_no || "-"}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" c={textPrimary}>
                              {rowData.product || "-"}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Group gap={4} wrap="nowrap">
                              <IconMapPin size={12} color="#94A3B8" />
                              <Text size="xs" c={textPrimary} lineClamp={1}>
                                {rowData.destination || "-"}
                              </Text>
                            </Group>
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }}>
                            <Text size="xs" fw={600} c={textPrimary}>
                              {rowData.quantity !== null && rowData.quantity !== undefined && rowData.quantity !== ""
                                ? Number(rowData.quantity).toLocaleString("en-IN", {
                                    maximumFractionDigits: 2,
                                  })
                                : "-"}
                            </Text>
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }}>
                            <Text size="xs" c={textMuted}>
                              {formatIndianCurrency(rowData.unit_price)}
                            </Text>
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }}>
                            <Text size="xs" fw={700} c="#2563EB">
                              {formatIndianCurrency(rowData.total_price)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            {row.messages && row.messages.length > 0 ? (
                              <Group gap={4} align="flex-start" wrap="nowrap">
                                {row.status === "error" ? (
                                  <IconAlertCircle size={14} color="#EF4444" style={{ flexShrink: 0, marginTop: 2 }} />
                                ) : (
                                  <IconAlertTriangle size={14} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
                                )}
                                <Text size="xs" c={row.status === "error" ? "#DC2626" : "#B45309"}>
                                  {row.messages.join("; ")}
                                </Text>
                              </Group>
                            ) : (
                              <Text size="xs" c="#16A34A">
                                Ready for import
                              </Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Box>
            </Paper>
          </Box>
        </Stack>
      )}
    </Box>
  );
};
