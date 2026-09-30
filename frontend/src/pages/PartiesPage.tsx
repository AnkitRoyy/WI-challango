import React, { useState } from "react";
import {
  Container,
  Title,
  Text,
  Button,
  Group,
  Stack,
  TextInput,
  ActionIcon,
  Table,
  Modal,
  Alert,
  Badge,
  Card,
  Paper,
  Loader,
  Skeleton,
  Tooltip,
  Box,
} from "@mantine/core";
import { useMediaQuery, useDebouncedValue } from "@mantine/hooks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import {
  IconUsers,
  IconPlus,
  IconSearch,
  IconEdit,
  IconTrash,
  IconReceiptTax,
  IconCheck,
  IconAlertCircle,
  IconSparkles,
  IconBuildingStore,
  IconPhone,
} from "@tabler/icons-react";
import { useAuth } from "../context/AuthContext";
import { useDarkTokens } from "../utils/useDarkTokens";
import {
  fetchPartiesApi,
  createPartyApi,
  updatePartyApi,
  deletePartyApi,
  lookupGstApi,
  type Party,
  type PartyCreateInput,
  type PartyUpdateInput,
} from "../api/parties";

export const PartiesPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const t = useDarkTokens();
  const isMobile = useMediaQuery("(max-width: 48em)");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);

  // Modal states
  const [modalOpened, setModalOpened] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [partyToDelete, setPartyToDelete] = useState<Party | null>(null);

  // Form states
  const [gstinInput, setGstinInput] = useState("");
  const [tradeNameInput, setTradeNameInput] = useState("");
  const [legalNameInput, setLegalNameInput] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [stateInput, setStateInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [initialChallanNoInput, setInitialChallanNoInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isFetchingGst, setIsFetchingGst] = useState(false);
  const [gstNotice, setGstNotice] = useState<string | null>(null);

  // Fetch parties
  const { data: parties = [], isLoading } = useQuery({
    queryKey: ["parties", debouncedSearch],
    queryFn: () => fetchPartiesApi(debouncedSearch),
  });

  const openAddModal = () => {
    setEditingParty(null);
    setGstinInput("");
    setTradeNameInput("");
    setLegalNameInput("");
    setAddressInput("");
    setStateInput("");
    setPhoneInput("");
    setInitialChallanNoInput("");
    setFormError(null);
    setGstNotice(null);
    setModalOpened(true);
  };

  const openEditModal = (party: Party) => {
    setEditingParty(party);
    setGstinInput(party.gst_number || "");
    setTradeNameInput(party.trade_name || party.name || "");
    setLegalNameInput(party.legal_name || "");
    setAddressInput(party.address || "");
    setStateInput(party.state || "");
    setPhoneInput(party.phone || "");
    setInitialChallanNoInput(party.initial_challan_no || "");
    setFormError(null);
    setGstNotice(null);
    setModalOpened(true);
  };

  // GST Auto-fetch
  const handleFetchGst = async () => {
    const cleanGst = gstinInput.trim().toUpperCase();
    if (!cleanGst) {
      setFormError("Please enter a GSTIN first");
      return;
    }

    setFormError(null);
    setGstNotice(null);
    setIsFetchingGst(true);

    try {
      const data = await lookupGstApi(cleanGst);
      if (data.trade_name) {
        setTradeNameInput(data.trade_name);
      }
      if (data.legal_name) {
        setLegalNameInput(data.legal_name);
      }
      // If trade_name was empty from provider but legal_name exists, prefill trade_name too
      if (!data.trade_name && data.legal_name && !tradeNameInput) {
        setTradeNameInput(data.legal_name);
      }
      if (data.address) {
        setAddressInput(data.address);
      }
      if (data.state) {
        setStateInput(data.state);
      }
      notifications.show({
        title: "GST Details Fetched",
        message: `Trade: ${data.trade_name || "—"} | Legal: ${data.legal_name || "—"}`,
        color: "green",
        icon: <IconCheck size={18} />,
      });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || "Failed to fetch GST details";
      // Clear notice and show warning toast without crashing
      setGstNotice(detail);
      notifications.show({
        title: "Manual Entry Required",
        message: detail,
        color: "yellow",
        icon: <IconAlertCircle size={18} />,
        autoClose: 6000,
      });
    } finally {
      setIsFetchingGst(false);
    }
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: PartyCreateInput) => createPartyApi(data),
    onSuccess: (party) => {
      queryClient.invalidateQueries({ queryKey: ["parties"] });
      notifications.show({
        title: "Party Created",
        message: `${party.trade_name || party.name} was added successfully.`,
        color: "green",
        icon: <IconCheck size={18} />,
      });
      setModalOpened(false);
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.detail || err?.message || "Failed to create party.");
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: PartyUpdateInput }) => updatePartyApi(id, data),
    onSuccess: (party) => {
      queryClient.invalidateQueries({ queryKey: ["parties"] });
      notifications.show({
        title: "Party Updated",
        message: `${party.trade_name || party.name} was updated successfully.`,
        color: "green",
        icon: <IconCheck size={18} />,
      });
      setModalOpened(false);
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.detail || err?.message || "Failed to update party.");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePartyApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parties"] });
      notifications.show({
        title: "Party Removed",
        message: "Party has been removed from active catalog.",
        color: "blue",
        icon: <IconCheck size={18} />,
      });
      setPartyToDelete(null);
    },
    onError: (err: any) => {
      notifications.show({
        title: "Delete Failed",
        message: err?.response?.data?.detail || err?.message || "Failed to delete party.",
        color: "red",
        icon: <IconAlertCircle size={18} />,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTrade = tradeNameInput.trim();
    const cleanLegal = legalNameInput.trim();
    const cleanState = stateInput.trim();
    const cleanGstin = gstinInput.trim().toUpperCase();

    // Required field validation
    if (!cleanTrade) {
      setFormError("Trade Name is required.");
      return;
    }
    if (!cleanLegal) {
      setFormError("Legal Name is required.");
      return;
    }
    if (!cleanState) {
      setFormError("State is required.");
      return;
    }

    // GSTIN length validation (if provided)
    if (cleanGstin && cleanGstin.length !== 15) {
      setFormError("GSTIN must be exactly 15 characters (e.g. 27AAPFU0939F1ZV).");
      return;
    }

    const cleanInitialChallan = initialChallanNoInput.trim();
    if (!cleanInitialChallan) {
      setFormError("Starting / First Challan Number is required.");
      return;
    }

    const primaryName = cleanTrade;
    const payload: PartyCreateInput = {
      name: primaryName,
      trade_name: cleanTrade || null,
      legal_name: cleanLegal || null,
      gst_number: cleanGstin || null,
      address: addressInput.trim() || null,
      state: cleanState || null,
      phone: phoneInput.trim() || null,
      initial_challan_no: cleanInitialChallan,
    };

    if (editingParty) {
      updateMutation.mutate({ id: editingParty.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Container size="xl" py={isMobile ? "md" : "xl"}>
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="center" wrap="wrap">
          <Group gap="xs">
            <IconUsers size={28} color="#3B82F6" />
            <Box>
              <Title order={2} c={t.textPrimary}>
                Parties & Customers
              </Title>
              <Text size="xs" c={t.textSecondary}>
                Manage parties, customers, and vendors with verified GSTIN records
              </Text>
            </Box>
          </Group>

          {isAdmin && (
            <Button
              leftSection={<IconPlus size={16} />}
              color="blue"
              onClick={openAddModal}
            >
              Add Party
            </Button>
          )}
        </Group>

        {/* Search */}
        <TextInput
          placeholder="Search by party name, trade name, legal name, GSTIN, or phone..."
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          radius="md"
          size="sm"
        />

        {/* Content */}
        {isLoading ? (
          <Stack gap="xs">
            <Skeleton height={40} radius="md" />
            <Skeleton height={40} radius="md" />
            <Skeleton height={40} radius="md" />
          </Stack>
        ) : parties.length === 0 ? (
          <Paper
            p="xl"
            radius="md"
            withBorder
            style={{
              backgroundColor: t.surface,
              borderColor: t.border,
              textAlign: "center",
            }}
          >
            <IconBuildingStore size={48} color={t.textSecondary} style={{ opacity: 0.5, margin: "0 auto" }} />
            <Text fw={600} size="md" c={t.textPrimary} mt="sm">
              No Parties Found
            </Text>
            <Text size="xs" c={t.textSecondary} mt={4}>
              {search ? "No parties matched your search term." : "Start by adding your first customer or vendor."}
            </Text>
            {isAdmin && !search && (
              <Button color="blue" size="xs" mt="md" onClick={openAddModal}>
                Add Party
              </Button>
            )}
          </Paper>
        ) : isMobile ? (
          /* Mobile Card View */
          <Stack gap="xs">
            {parties.map((party) => (
              <Card
                key={party.id}
                p="sm"
                radius="md"
                withBorder
                style={{ backgroundColor: t.surface, borderColor: t.border }}
              >
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Box style={{ flex: 1 }}>
                    <Text fw={700} size="sm" c={t.textPrimary}>
                      {party.trade_name || party.name}
                    </Text>
                    {party.legal_name && party.legal_name !== (party.trade_name || party.name) && (
                      <Text size="xs" c={t.textSecondary} fw={500} mt={1}>
                        Legal: {party.legal_name}
                      </Text>
                    )}
                    {party.gst_number ? (
                      <Badge size="xs" variant="light" color="blue" mt={4}>
                        GST: {party.gst_number}
                      </Badge>
                    ) : (
                      <Badge size="xs" variant="outline" color="gray" mt={4}>
                        No GST
                      </Badge>
                    )}
                    {party.state && (
                      <Text size="xs" c={t.textSecondary} mt={2}>
                        📍 {party.state}
                      </Text>
                    )}
                    {party.phone && (
                      <Text size="xs" c={t.textSecondary} mt={2}>
                        📞 {party.phone}
                      </Text>
                    )}
                    {party.initial_challan_no && (
                      <Badge size="xs" variant="light" color="cyan" mt={4}>
                        Series Starts: {party.initial_challan_no}
                      </Badge>
                    )}
                    {party.address && (
                      <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
                        {party.address}
                      </Text>
                    )}
                  </Box>

                  {isAdmin && (
                    <Group gap={4}>
                      <ActionIcon
                        variant="subtle"
                        color="blue"
                        size="sm"
                        onClick={() => openEditModal(party)}
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        onClick={() => setPartyToDelete(party)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  )}
                </Group>
              </Card>
            ))}
          </Stack>
        ) : (
          /* Desktop Table View */
          <Paper radius="md" withBorder style={{ backgroundColor: t.surface, borderColor: t.border, overflow: "hidden" }}>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead style={{ backgroundColor: t.isDark ? "#0F172A" : "#F8FAFC" }}>
                <Table.Tr>
                  <Table.Th>Trade / Party Name</Table.Th>
                  <Table.Th>Legal Name</Table.Th>
                  <Table.Th style={{ width: 150 }}>GSTIN</Table.Th>
                  <Table.Th style={{ width: 140 }}>Phone</Table.Th>
                  <Table.Th style={{ width: 130 }}>State</Table.Th>
                  <Table.Th style={{ width: 140 }}>Starting Challan</Table.Th>
                  <Table.Th>Address</Table.Th>
                  {isAdmin && <Table.Th style={{ width: 100, textAlign: "center" }}>Actions</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {parties.map((party) => (
                  <Table.Tr key={party.id}>
                    <Table.Td>
                      <Text fw={600} size="sm" c={t.textPrimary}>
                        {party.trade_name || party.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={party.legal_name ? t.textSecondary : "dimmed"}>
                        {party.legal_name || "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {party.gst_number ? (
                        <Text size="xs" ff="monospace" fw={600} c="#2563EB">
                          {party.gst_number}
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {party.phone ? (
                        <Text size="xs" ff="monospace" fw={500} c={t.textPrimary}>
                          {party.phone}
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={t.textPrimary}>
                        {party.state || "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {party.initial_challan_no ? (
                        <Badge size="sm" variant="light" color="cyan" ff="monospace">
                          {party.initial_challan_no}
                        </Badge>
                      ) : (
                        <Text size="xs" c="dimmed">
                          Auto
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c={t.textSecondary} lineClamp={1} title={party.address || ""}>
                        {party.address || "—"}
                      </Text>
                    </Table.Td>
                    {isAdmin && (
                      <Table.Td>
                        <Group gap={4} justify="center">
                          <Tooltip label="Edit party">
                            <ActionIcon
                              variant="subtle"
                              color="blue"
                              size="sm"
                              onClick={() => openEditModal(party)}
                            >
                              <IconEdit size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Delete party">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              size="sm"
                              onClick={() => setPartyToDelete(party)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}
      </Stack>

      {/* Add / Edit Party Modal */}
      <Modal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title={
          <Group gap="xs">
            <IconReceiptTax size={18} color="#3B82F6" />
            <Text fw={700} size="sm" c={t.textPrimary}>
              {editingParty ? "Edit Party" : "Add New Party"}
            </Text>
          </Group>
        }
        size="md"
        centered
        radius="md"
        styles={{
          content: { backgroundColor: t.surface },
          header: { backgroundColor: t.surface },
        }}
      >
        <form onSubmit={handleSubmit}>
          <Stack gap="sm">
            {formError && (
              <Alert icon={<IconAlertCircle size={14} />} title="Error" color="red" variant="light" py={6}>
                <Text size="xs">{formError}</Text>
              </Alert>
            )}

            {gstNotice && (
              <Alert icon={<IconAlertCircle size={14} />} title="Notice" color="yellow" variant="light" py={6}>
                <Text size="xs">{gstNotice}</Text>
              </Alert>
            )}

            {/* GSTIN with Fetch Button */}
            <Box>
              <TextInput
                label="GSTIN (Optional — 15 digits)"
                placeholder="e.g. 27AAPFU0939F1ZV"
                value={gstinInput}
                maxLength={15}
                onChange={(e) => setGstinInput(e.currentTarget.value.toUpperCase())}
                rightSection={
                  <Button
                    size="xs"
                    variant="light"
                    color="blue"
                    leftSection={isFetchingGst ? <Loader size={12} /> : <IconSparkles size={12} />}
                    onClick={handleFetchGst}
                    disabled={isFetchingGst || !gstinInput.trim()}
                    style={{ height: 28, marginRight: 4 }}
                  >
                    Fetch
                  </Button>
                }
                rightSectionWidth={80}
              />
              <Text size="10px" c="dimmed" mt={2}>
                Enter 15-digit GSTIN and click Fetch to auto-populate Trade Name, Legal Name &amp; State.
              </Text>
            </Box>

            {/* Trade Name — required */}
            <TextInput
              label="Trade Name (Business / Brand Name)"
              description="Name used for trading / business operations"
              placeholder="e.g. Sharma Traders"
              required
              value={tradeNameInput}
              onChange={(e) => setTradeNameInput(e.currentTarget.value)}
            />

            {/* Legal Name — required */}
            <TextInput
              label="Legal Name"
              description="Official registered entity or proprietor name"
              placeholder="e.g. Anil Kumar Sharma"
              required
              value={legalNameInput}
              onChange={(e) => setLegalNameInput(e.currentTarget.value)}
            />

            {/* State — required */}
            <TextInput
              label="State"
              placeholder="e.g. Maharashtra"
              required
              value={stateInput}
              onChange={(e) => setStateInput(e.currentTarget.value)}
            />

            {/* Phone Number */}
            <TextInput
              label="Phone Number"
              placeholder="e.g. 9876543210"
              leftSection={<IconPhone size={16} />}
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.currentTarget.value)}
            />

            {/* Address */}
            <TextInput
              label="Address"
              placeholder="e.g. Plot 12, Andheri Industrial Estate, Mumbai"
              value={addressInput}
              onChange={(e) => setAddressInput(e.currentTarget.value)}
            />

            {/* Starting Challan No */}
            <TextInput
              label="Starting / First Challan Number"
              required
              description="Starting number for this party's ledger series (e.g. SHT-001 or 1001)"
              placeholder="e.g. SHT-001"
              value={initialChallanNoInput}
              onChange={(e) => setInitialChallanNoInput(e.currentTarget.value)}
            />

            <Group justify="flex-end" gap="xs" mt="md">
              <Button variant="default" onClick={() => setModalOpened(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" color="blue" loading={isSaving}>
                {editingParty ? "Save Changes" : "Create Party"}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={Boolean(partyToDelete)}
        onClose={() => setPartyToDelete(null)}
        title={<Text fw={700} size="sm">Remove Party?</Text>}
        size="xs"
        centered
        radius="md"
        styles={{
          content: { backgroundColor: t.surface },
          header: { backgroundColor: t.surface },
        }}
      >
        <Stack gap="sm">
          <Text size="xs" c={t.textSecondary}>
            Are you sure you want to remove <Text span fw={600} c={t.textPrimary}>{partyToDelete?.trade_name || partyToDelete?.name}</Text> from the active catalog? Historical records referencing this party will be kept.
          </Text>
          <Group justify="flex-end" gap="xs" mt="xs">
            <Button variant="default" size="xs" onClick={() => setPartyToDelete(null)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button
              color="red"
              size="xs"
              loading={deleteMutation.isPending}
              onClick={() => partyToDelete && deleteMutation.mutate(partyToDelete.id)}
            >
              Remove
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
};
