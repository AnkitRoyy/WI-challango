import React, { useState, useCallback } from "react";
import {
  Box,
  Paper,
  Title,
  Text,
  Group,
  Stack,
  SegmentedControl,
  SimpleGrid,
  Card,
  Skeleton,
  Table,
  Badge,
  ActionIcon,
  Button,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconChartBar,
  IconTruckDelivery,
  IconPackage,
  IconCash,
  IconBuildingStore,
  IconMapPin,
  IconFilterOff,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from "recharts";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(isoWeek);

import {
  fetchAnalyticsSummaryApi,
  fetchTopProductsApi,
  fetchTopDestinationsApi,
} from "../api/analytics";
import { formatIndianCurrency } from "../utils/formatters";
import { useDarkTokens } from "../utils/useDarkTokens";

type Period = "day" | "week" | "month" | "year";

/** Compute date_from / date_to for a given period and offset (0 = current, -1 = previous, etc.) */
function periodRange(
  period: Period,
  offset: number
): { dateFrom: string; dateTo: string; label: string } {
  const now = dayjs();
  let start: dayjs.Dayjs;
  let end: dayjs.Dayjs;
  let label: string;

  switch (period) {
    case "day":
      start = now.add(offset, "day").startOf("day");
      end = now.add(offset, "day").endOf("day");
      label = start.format("ddd, D MMM YYYY");
      break;
    case "week":
      start = now.add(offset, "week").startOf("isoWeek");
      end = now.add(offset, "week").endOf("isoWeek");
      label = `Week of ${start.format("D MMM")} – ${end.format("D MMM YYYY")}`;
      break;
    case "month":
      start = now.add(offset, "month").startOf("month");
      end = now.add(offset, "month").endOf("month");
      label = start.format("MMMM YYYY");
      break;
    case "year":
      start = now.add(offset, "year").startOf("year");
      end = now.add(offset, "year").endOf("year");
      label = start.format("YYYY");
      break;
  }

  return {
    dateFrom: start.format("YYYY-MM-DD"),
    dateTo: end.format("YYYY-MM-DD"),
    label,
  };
}

export const AnalyticsPage: React.FC = () => {
  const t = useDarkTokens();
  const { isDark } = t;

  // Period toggle state: day | week | month | year
  const [period, setPeriod] = useState<Period>("month");

  // Offset from "current" period: 0 = this period, -1 = last period, etc.
  const [periodOffset, setPeriodOffset] = useState(0);

  // Optional custom date range override (when set, overrides period + offset)
  const [customRange, setCustomRange] = useState<[Date | null, Date | null]>([null, null]);
  const isCustomRange = Boolean(customRange[0] && customRange[1]);

  // Ranking toggles: "value" | "quantity"
  const [productRankingMetric, setProductRankingMetric] = useState<"value" | "quantity">("value");
  const [destRankingMetric, setDestRankingMetric] = useState<"value" | "quantity">("value");

  // Compute effective date range
  const { dateFrom: periodDateFrom, dateTo: periodDateTo, label: periodLabel } = periodRange(period, periodOffset);

  const customDateFromStr = customRange[0] ? dayjs(customRange[0]).format("YYYY-MM-DD") : undefined;
  const customDateToStr = customRange[1] ? dayjs(customRange[1]).format("YYYY-MM-DD") : undefined;

  const effectiveDateFrom = isCustomRange ? customDateFromStr : periodDateFrom;
  const effectiveDateTo = isCustomRange ? customDateToStr : periodDateTo;

  const effectiveLabel = isCustomRange
    ? `${dayjs(customRange[0]!).format("D MMM")} – ${dayjs(customRange[1]!).format("D MMM YYYY")}`
    : periodLabel;

  // 1. Summary Query
  const summaryQuery = useQuery({
    queryKey: ["analytics-summary", period, effectiveDateFrom, effectiveDateTo],
    queryFn: () => fetchAnalyticsSummaryApi(period, effectiveDateFrom, effectiveDateTo),
  });

  // 2. Top Products Query
  const topProductsQuery = useQuery({
    queryKey: ["analytics-top-products", period, effectiveDateFrom, effectiveDateTo],
    queryFn: () => fetchTopProductsApi(period, effectiveDateFrom, effectiveDateTo, 10),
  });

  // 3. Top Destinations Query
  const topDestinationsQuery = useQuery({
    queryKey: ["analytics-top-destinations", period, effectiveDateFrom, effectiveDateTo],
    queryFn: () => fetchTopDestinationsApi(period, effectiveDateFrom, effectiveDateTo, 10),
  });

  const chartData = (summaryQuery.data?.buckets || []).map((b) => ({
    label: b.bucket_label,
    value: Number(b.total_value),
    quantity: Number(b.total_quantity),
    count: b.entry_count,
  }));

  const handleClearCustomRange = useCallback(() => {
    setCustomRange([null, null]);
  }, []);

  const handlePrev = useCallback(() => {
    setPeriodOffset((o) => o - 1);
    setCustomRange([null, null]); // Clear custom range on manual nav
  }, []);

  const handleNext = useCallback(() => {
    if (periodOffset < 0) {
      setPeriodOffset((o) => o + 1);
      setCustomRange([null, null]);
    }
  }, [periodOffset]);

  const isAtCurrentPeriod = periodOffset >= 0;

  // When period changes, reset offset to 0 (current period)
  const handlePeriodChange = useCallback((val: string) => {
    setPeriod(val as Period);
    setPeriodOffset(0);
    setCustomRange([null, null]);
  }, []);

  const topProductsList =
    productRankingMetric === "value"
      ? topProductsQuery.data?.by_value || []
      : topProductsQuery.data?.by_quantity || [];

  const topDestinationsList =
    destRankingMetric === "value"
      ? topDestinationsQuery.data?.by_value || []
      : topDestinationsQuery.data?.by_quantity || [];

  const cardBg = isDark ? "#1E293B" : "#FFFFFF";
  const cardBorder = isDark ? "#334155" : "#E2E8F0";
  const textPrimary = isDark ? "#F8FAFC" : "#0F172A";

  return (
    <Box py="sm">
      {/* Header */}
      <Stack gap="xs" mb="md">
        <Group justify="space-between" align="center" wrap="wrap">
          <Box>
            <Title order={1} size="h3" fw={800} c={textPrimary}>
              Executive Analytics
            </Title>
            <Text size="xs" c="#64748B">
              Logistics valuation, product volumes, and route metrics
            </Text>
          </Box>
        </Group>

        {/* Controls Bar: Period Toggle & Custom Date Picker */}
        <Paper
          withBorder
          p="xs"
          radius="md"
          style={{
            backgroundColor: cardBg,
            borderColor: cardBorder,
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between" align="center" wrap="wrap" gap="xs">
              <SegmentedControl
                value={period}
                onChange={handlePeriodChange}
                data={[
                  { label: "Day", value: "day" },
                  { label: "Week", value: "week" },
                  { label: "Month", value: "month" },
                  { label: "Year", value: "year" },
                ]}
                size="sm"
                radius="md"
                color="blue"
                style={{ minHeight: "42px", flexGrow: 1 }}
              />

              {isCustomRange && (
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  leftSection={<IconFilterOff size={14} />}
                  onClick={handleClearCustomRange}
                >
                  Clear Range
                </Button>
              )}
            </Group>

            {/* Custom Date Range override */}
            <DatePickerInput
              type="range"
              placeholder="Override date range (Optional)"
              value={customRange}
              onChange={(dates) => {
                if (!dates) {
                  setCustomRange([null, null]);
                } else {
                  const [start, end] = dates;
                  setCustomRange([
                    start ? (typeof start === "string" ? new Date(start) : start) : null,
                    end ? (typeof end === "string" ? new Date(end) : end) : null,
                  ]);
                  // Reset offset when user picks custom range
                  setPeriodOffset(0);
                }
              }}
              clearable
              size="xs"
            />
          </Stack>
        </Paper>
      </Stack>

      {/* Compact Stat Strip */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" mb="md">
        <Card withBorder radius="md" p="sm" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
          <Group justify="space-between" align="center">
            <Box>
              <Text size="11px" fw={700} c="#64748B" tt="uppercase">Total Entries</Text>
              {summaryQuery.isLoading ? (
                <Skeleton height={24} width={70} mt={4} />
              ) : (
                <Text size="lg" fw={800} c={textPrimary}>
                  {summaryQuery.data?.total_entries ?? 0}
                </Text>
              )}
            </Box>
            <Box p={6} style={{ backgroundColor: "#EFF6FF", borderRadius: "8px" }}>
              <IconTruckDelivery size={20} color="#2563EB" />
            </Box>
          </Group>
        </Card>

        <Card withBorder radius="md" p="sm" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
          <Group justify="space-between" align="center">
            <Box>
              <Text size="11px" fw={700} c="#64748B" tt="uppercase">Total Units Dispatched</Text>
              {summaryQuery.isLoading ? (
                <Skeleton height={24} width={90} mt={4} />
              ) : (
                <Text size="lg" fw={800} c={textPrimary}>
                  {Number(summaryQuery.data?.total_quantity ?? 0).toLocaleString("en-IN", {
                    maximumFractionDigits: 2,
                  })}
                </Text>
              )}
            </Box>
            <Box p={6} style={{ backgroundColor: "#F0FDF4", borderRadius: "8px" }}>
              <IconPackage size={20} color="#16A34A" />
            </Box>
          </Group>
        </Card>

        <Card withBorder radius="md" p="sm" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
          <Group justify="space-between" align="center">
            <Box>
              <Text size="11px" fw={700} c="#64748B" tt="uppercase">Total Valuation</Text>
              {summaryQuery.isLoading ? (
                <Skeleton height={24} width={120} mt={4} />
              ) : (
                <Text size="lg" fw={800} c="#2563EB">
                  {formatIndianCurrency(summaryQuery.data?.total_value ?? 0)}
                </Text>
              )}
            </Box>
            <Box p={6} style={{ backgroundColor: "#EFF6FF", borderRadius: "8px" }}>
              <IconCash size={20} color="#2563EB" />
            </Box>
          </Group>
        </Card>
      </SimpleGrid>

      {/* Main Chart Card */}
      <Paper
        withBorder
        p="md"
        radius="md"
        mb="md"
        style={{ backgroundColor: cardBg, borderColor: cardBorder }}
      >
        {/* Chart Header with prev/next nav */}
        <Group justify="space-between" align="center" mb="xs" wrap="wrap" gap="xs">
          <Group gap="xs">
            <IconChartBar size={20} color="#2563EB" />
            <Text fw={700} size="sm" c={textPrimary}>
              Total Valuation Trend
            </Text>
          </Group>
          <Text size="xs" c="#64748B">Amounts in INR (₹)</Text>
        </Group>

        {/* Period label + prev/next controls */}
        {!isCustomRange && (
          <Group justify="space-between" align="center" mb="md">
            <ActionIcon
              variant="default"
              size="md"
              radius="md"
              onClick={handlePrev}
              aria-label="Previous period"
            >
              <IconChevronLeft size={16} />
            </ActionIcon>

            <Box ta="center" style={{ flex: 1 }}>
              <Text size="sm" fw={700} c={textPrimary}>
                {effectiveLabel}
              </Text>
              {periodOffset < 0 && (
                <Text size="xs" c="#64748B">
                  {Math.abs(periodOffset)} {period}(s) ago
                </Text>
              )}
            </Box>

            <ActionIcon
              variant="default"
              size="md"
              radius="md"
              onClick={handleNext}
              disabled={isAtCurrentPeriod}
              aria-label="Next period"
            >
              <IconChevronRight size={16} />
            </ActionIcon>
          </Group>
        )}

        {isCustomRange && (
          <Box mb="md" ta="center">
            <Text size="sm" fw={700} c={textPrimary}>
              📅 {effectiveLabel}
            </Text>
            <Text size="xs" c="#64748B">Custom range</Text>
          </Box>
        )}

        {summaryQuery.isLoading ? (
          <Skeleton height={260} radius="md" />
        ) : chartData.length === 0 ? (
          <Box py={50} ta="center">
            <IconChartBar size={36} color="#94A3B8" />
            <Text size="sm" c="#64748B" mt="xs">
              No entries recorded in the selected period.
            </Text>
          </Box>
        ) : (
          <Box style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={t.border} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: t.textSecondary }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  angle={-25}
                  textAnchor="end"
                  height={45}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: t.textMuted }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => {
                    if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
                    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
                    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
                    return `₹${val}`;
                  }}
                />
                <RechartsTooltip
                  formatter={(value: any) => [formatIndianCurrency(value), "Valuation"]}
                  labelFormatter={(label) => `Period: ${label}`}
                  contentStyle={{
                    backgroundColor: isDark ? "#0F172A" : "#FFFFFF",
                    borderColor: isDark ? "#334155" : "#CBD5E1",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: isDark ? "#F8FAFC" : "#1E293B",
                  }}
                />
                <Bar dataKey="value" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Paper>

      {/* Two Ranking Panels: Top Products & Top Destinations */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* Top Products */}
        <Paper withBorder p="md" radius="md" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
          <Group justify="space-between" align="center" mb="sm" wrap="wrap" gap="xs">
            <Group gap="xs">
              <IconBuildingStore size={18} color="#2563EB" />
              <Text fw={700} size="sm" c={textPrimary}>Top Products</Text>
            </Group>
            <SegmentedControl
              value={productRankingMetric}
              onChange={(val) => setProductRankingMetric(val as any)}
              data={[
                { label: "By Value", value: "value" },
                { label: "By Quantity", value: "quantity" },
              ]}
              size="xs"
              radius="sm"
            />
          </Group>

          {topProductsQuery.isLoading ? (
            <Stack gap="xs">
              <Skeleton height={28} />
              <Skeleton height={28} />
              <Skeleton height={28} />
            </Stack>
          ) : topProductsList.length === 0 ? (
            <Text size="xs" c="#64748B" ta="center" py="md">
              No product entries in this period.
            </Text>
          ) : (
            <Table verticalSpacing="xs" striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 30 }}>#</Table.Th>
                  <Table.Th>Product</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>
                    {productRankingMetric === "value" ? "Total Value" : "Quantity"}
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {topProductsList.map((item, idx) => (
                  <Table.Tr key={item.product}>
                    <Table.Td>
                      <Badge size="xs" variant="light" color={idx === 0 ? "yellow" : "gray"}>
                        {idx + 1}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" fw={600} lineClamp={1} title={item.product}>
                        {item.product}
                      </Text>
                      <Text size="10px" c="#64748B">
                        {item.entry_count} challans
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      <Text size="xs" fw={700} c={productRankingMetric === "value" ? "#2563EB" : undefined}>
                        {productRankingMetric === "value"
                          ? formatIndianCurrency(item.total_value)
                          : Number(item.total_quantity).toLocaleString("en-IN")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>

        {/* Top Destinations */}
        <Paper withBorder p="md" radius="md" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
          <Group justify="space-between" align="center" mb="sm" wrap="wrap" gap="xs">
            <Group gap="xs">
              <IconMapPin size={18} color="#16A34A" />
              <Text fw={700} size="sm" c={textPrimary}>Top Destinations</Text>
            </Group>
            <SegmentedControl
              value={destRankingMetric}
              onChange={(val) => setDestRankingMetric(val as any)}
              data={[
                { label: "By Value", value: "value" },
                { label: "By Quantity", value: "quantity" },
              ]}
              size="xs"
              radius="sm"
            />
          </Group>

          {topDestinationsQuery.isLoading ? (
            <Stack gap="xs">
              <Skeleton height={28} />
              <Skeleton height={28} />
              <Skeleton height={28} />
            </Stack>
          ) : topDestinationsList.length === 0 ? (
            <Text size="xs" c="#64748B" ta="center" py="md">
              No destination records in this period.
            </Text>
          ) : (
            <Table verticalSpacing="xs" striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 30 }}>#</Table.Th>
                  <Table.Th>Destination</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>
                    {destRankingMetric === "value" ? "Total Value" : "Quantity"}
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {topDestinationsList.map((item, idx) => (
                  <Table.Tr key={item.destination}>
                    <Table.Td>
                      <Badge size="xs" variant="light" color={idx === 0 ? "yellow" : "gray"}>
                        {idx + 1}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" fw={600} lineClamp={1} title={item.destination}>
                        {item.destination}
                      </Text>
                      <Text size="10px" c="#64748B">
                        {item.entry_count} deliveries
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      <Text size="xs" fw={700} c={destRankingMetric === "value" ? "#16A34A" : undefined}>
                        {destRankingMetric === "value"
                          ? formatIndianCurrency(item.total_value)
                          : Number(item.total_quantity).toLocaleString("en-IN")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
      </SimpleGrid>
    </Box>
  );
};
