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
  ActionIcon,
  Tooltip,
  Modal,
  TextInput,
  NumberInput,
  Alert,
  Skeleton,
  Switch,
  Card,
  Menu,
  useMantineColorScheme,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBuildingStore,
  IconPlus,
  IconEdit,
  IconTrash,
  IconSearch,
  IconCheck,
  IconAlertCircle,
  IconAlertTriangle,
  IconDotsVertical,
} from "@tabler/icons-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@mantine/hooks";

import {
  fetchProductsApi,
  createProductApi,
  updateProductApi,
  deleteProductApi,
  type Product,
  type ProductCreatePayload,
  type ProductUpdatePayload,
} from "../api/products";
import { formatIndianCurrency, formatDate } from "../utils/formatters";

export const ProductsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  // Search & filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch] = useDebouncedValue(searchInput, 350);
  const [includeInactive, setIncludeInactive] = useState(true);

  // Create modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPrice, setCreatePrice] = useState<number | string>("");
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createServerError, setCreateServerError] = useState<string | null>(null);

  // Edit modal state
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState<number | string>("");
  const [editActive, setEditActive] = useState(true);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editServerError, setEditServerError] = useState<string | null>(null);

  // Deactivate modal state
  const [productToDeactivate, setProductToDeactivate] = useState<Product | null>(null);

  // Fetch products query
  const productsQuery = useQuery({
    queryKey: ["admin-products", debouncedSearch, includeInactive],
    queryFn: () => fetchProductsApi(debouncedSearch, includeInactive),
  });

  // Create product mutation
  const createMutation = useMutation({
    mutationFn: async (payload: ProductCreatePayload) => {
      return await createProductApi(payload);
    },
    onSuccess: (newProd) => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      notifications.show({
        title: "Product Created",
        message: `${newProd.name} added to catalog at ${formatIndianCurrency(newProd.default_unit_price)}.`,
        color: "green",
        icon: <IconCheck size={18} />,
      });
      handleCloseCreateModal();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ||
        (err?.response?.status === 409
          ? "A product with this name already exists in the catalog."
          : "Failed to create product.");
      setCreateServerError(msg);
    },
  });

  // Update product mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: ProductUpdatePayload }) => {
      return await updateProductApi(id, payload);
    },
    onSuccess: (updatedProd) => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      notifications.show({
        title: "Product Updated",
        message: `${updatedProd.name} updated successfully.`,
        color: "green",
        icon: <IconCheck size={18} />,
      });
      setProductToEdit(null);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ||
        (err?.response?.status === 409
          ? "A product with this name already exists in the catalog."
          : "Failed to update product.");
      setEditServerError(msg);
    },
  });

  // Deactivate product mutation (soft delete)
  const deactivateMutation = useMutation({
    mutationFn: async (productId: number) => {
      return await deleteProductApi(productId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      notifications.show({
        title: "Product Deactivated",
        message: `${productToDeactivate?.name} has been deactivated. Historical entries remain untouched.`,
        color: "orange",
        icon: <IconCheck size={18} />,
      });
      setProductToDeactivate(null);
    },
    onError: (err: any) => {
      notifications.show({
        title: "Deactivation Failed",
        message: err?.response?.data?.detail || "Could not deactivate product.",
        color: "red",
        icon: <IconAlertCircle size={18} />,
      });
    },
  });

  const handleOpenCreateModal = () => {
    setCreateName("");
    setCreatePrice("");
    setCreateErrors({});
    setCreateServerError(null);
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
  };

  const handleOpenEditModal = (prod: Product) => {
    setProductToEdit(prod);
    setEditName(prod.name);
    setEditPrice(Number(prod.default_unit_price));
    setEditActive(prod.is_active);
    setEditErrors({});
    setEditServerError(null);
  };

  const validateCreate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!createName.trim()) errs.name = "Product name is required";
    const pNum = typeof createPrice === "number" ? createPrice : parseFloat(String(createPrice));
    if (createPrice === "" || isNaN(pNum) || pNum < 0) {
      errs.price = "Default unit price must be 0 or greater";
    }
    setCreateErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateServerError(null);
    if (validateCreate()) {
      createMutation.mutate({
        name: createName.trim(),
        default_unit_price: createPrice,
      });
    }
  };

  const validateEdit = (): boolean => {
    const errs: Record<string, string> = {};
    if (!editName.trim()) errs.name = "Product name is required";
    const pNum = typeof editPrice === "number" ? editPrice : parseFloat(String(editPrice));
    if (editPrice === "" || isNaN(pNum) || pNum < 0) {
      errs.price = "Default unit price must be 0 or greater";
    }
    setEditErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productToEdit) return;
    setEditServerError(null);
    if (validateEdit()) {
      updateMutation.mutate({
        id: productToEdit.id,
        payload: {
          name: editName.trim(),
          default_unit_price: editPrice,
          is_active: editActive,
        },
      });
    }
  };

  const cardBg = isDark ? "#1E293B" : "#FFFFFF";
  const cardBorder = isDark ? "#334155" : "#E2E8F0";
  const textPrimary = isDark ? "#F8FAFC" : "#0F172A";
  const textMuted = isDark ? "#94A3B8" : "#64748B";

  return (
    <Box py="sm">
      {/* Header Bar */}
      <Group justify="space-between" align="center" mb="sm" wrap="wrap" gap="xs">
        <Box>
          <Title order={1} size="h3" fw={800} c={textPrimary}>
            Products Catalog
          </Title>
          <Text size="xs" c={textMuted}>
            Manage standard delivery catalog items and default pricing
          </Text>
        </Box>

        <Button
          color="blue"
          size="sm"
          radius="md"
          leftSection={<IconPlus size={16} />}
          onClick={handleOpenCreateModal}
          style={{ boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)" }}
        >
          Add Product
        </Button>
      </Group>

      {/* Search and Filters Bar */}
      <Paper withBorder p="xs" radius="md" mb="sm" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
        <Group justify="space-between" align="center" wrap="wrap" gap="xs">
          <TextInput
            placeholder="Search products..."
            leftSection={<IconSearch size={16} color="#94A3B8" />}
            value={searchInput}
            onChange={(e) => setSearchInput(e.currentTarget.value)}
            size="sm"
            style={{ flex: 1, minWidth: 200 }}
          />

          <Switch
            label="Show inactive"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.currentTarget.checked)}
            size="xs"
          />
        </Group>
      </Paper>

      {/* ── MOBILE CARD LIST VIEW (hiddenFrom="sm") ── */}
      <Box hiddenFrom="sm">
        {productsQuery.isLoading ? (
          <Stack gap="xs">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} withBorder radius="md" p="sm" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
                <Group justify="space-between" mb={6}>
                  <Skeleton height={20} width="50%" />
                  <Skeleton height={18} width="20%" />
                </Group>
                <Skeleton height={18} width="35%" mb={6} />
                <Skeleton height={14} width="40%" />
              </Card>
            ))}
          </Stack>
        ) : productsQuery.data?.length === 0 ? (
          <Paper withBorder radius="md" p="xl" ta="center" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
            <IconBuildingStore size={44} color="#94A3B8" stroke={1.5} />
            <Text fw={700} size="sm" c={textPrimary} mt="sm">
              No products found
            </Text>
            <Text size="xs" c={textMuted} mt={2} mb="md">
              {searchInput ? "No products match your search query." : "Add catalog products to speed up entry creation."}
            </Text>
            <Button size="xs" color="blue" onClick={handleOpenCreateModal}>
              Add First Product
            </Button>
          </Paper>
        ) : (
          <Stack gap="xs">
            {productsQuery.data?.map((prod) => (
              <Card
                key={prod.id}
                withBorder
                radius="md"
                p="sm"
                style={{ backgroundColor: cardBg, borderColor: cardBorder }}
              >
                {/* Line 1: Product Name + Status */}
                <Group justify="space-between" align="flex-start" wrap="nowrap" mb={4}>
                  <Text fw={700} size="sm" c={textPrimary} lineClamp={1} style={{ flex: 1 }}>
                    {prod.name}
                  </Text>
                  {prod.is_active ? (
                    <Badge color="green" variant="light" size="xs">
                      Active
                    </Badge>
                  ) : (
                    <Badge color="gray" variant="light" size="xs">
                      Inactive
                    </Badge>
                  )}
                </Group>

                {/* Line 2: Default Price */}
                <Group justify="space-between" align="center" mb={6}>
                  <Text size="md" fw={800} c="#2563EB">
                    {formatIndianCurrency(prod.default_unit_price)} <Text component="span" size="xs" c={textMuted} fw={400}>/ unit</Text>
                  </Text>
                </Group>

                {/* Line 3: ID, Created Date, Action Menu */}
                <Group justify="space-between" align="center" wrap="nowrap">
                  <Text size="xs" c={textMuted}>
                    #{prod.id} • {formatDate(prod.created_at)}
                  </Text>

                  {/* Actions Menu */}
                  <Menu position="bottom-end" shadow="md" width={140} withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Actions">
                        <IconDotsVertical size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => handleOpenEditModal(prod)}>
                        Edit Price
                      </Menu.Item>
                      {prod.is_active && (
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => setProductToDeactivate(prod)}
                        >
                          Deactivate
                        </Menu.Item>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Box>

      {/* ── DESKTOP TABLE VIEW (visibleFrom="sm") ── */}
      <Box visibleFrom="sm">
        <Paper withBorder radius="md" style={{ backgroundColor: cardBg, borderColor: cardBorder, overflow: "hidden" }}>
          <Box p="sm" style={{ borderBottom: `1px solid ${cardBorder}` }}>
            <Group justify="space-between">
              <Group gap="xs">
                <IconBuildingStore size={18} color="#2563EB" />
                <Text fw={700} size="sm" c={textPrimary}>
                  Catalog Items
                </Text>
              </Group>
              {productsQuery.data && (
                <Text size="xs" c={textMuted}>
                  Total: <b>{productsQuery.data.length}</b> products
                </Text>
              )}
            </Group>
          </Box>

          <Box style={{ overflowX: "auto" }}>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md" style={{ minWidth: 700 }}>
              <Table.Thead style={{ backgroundColor: isDark ? "#0F172A" : "#F8FAFC" }}>
                <Table.Tr>
                  <Table.Th style={{ width: 70 }}>ID</Table.Th>
                  <Table.Th>Product Name</Table.Th>
                  <Table.Th style={{ width: 180, textAlign: "right" }}>Default Unit Price</Table.Th>
                  <Table.Th style={{ width: 120 }}>Status</Table.Th>
                  <Table.Th style={{ width: 130 }}>Created Date</Table.Th>
                  <Table.Th style={{ width: 100, textAlign: "center" }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>

              <Table.Tbody>
                {productsQuery.isLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <Table.Tr key={`prod-skel-${idx}`}>
                      <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                      <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                      <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                      <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                      <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                      <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                    </Table.Tr>
                  ))
                ) : productsQuery.data?.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Box py={40} ta="center">
                        <IconBuildingStore size={40} color="#94A3B8" stroke={1.5} />
                        <Text fw={600} size="sm" c={textPrimary} mt="xs">
                          No products found in catalog
                        </Text>
                        <Text size="xs" c={textMuted} mt={2} mb="md">
                          {searchInput
                            ? "No products match your search query."
                            : "Add standard products to speed up entry creation with automatic price filling."}
                        </Text>
                        <Button size="xs" color="blue" onClick={handleOpenCreateModal}>
                          Add First Product
                        </Button>
                      </Box>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  productsQuery.data?.map((prod) => (
                    <Table.Tr key={prod.id}>
                      <Table.Td>
                        <Text size="xs" c={textMuted}>
                          #{prod.id}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fw={600} size="sm" c={textPrimary}>
                          {prod.name}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        <Text size="sm" fw={700} c="#2563EB">
                          {formatIndianCurrency(prod.default_unit_price)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {prod.is_active ? (
                          <Badge color="green" variant="light" size="sm">
                            Active
                          </Badge>
                        ) : (
                          <Badge color="gray" variant="light" size="sm">
                            Inactive
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c={textMuted}>
                          {formatDate(prod.created_at)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6} justify="center">
                          <Tooltip label="Edit product / price">
                            <ActionIcon
                              variant="subtle"
                              color="blue"
                              size="sm"
                              onClick={() => handleOpenEditModal(prod)}
                            >
                              <IconEdit size={16} />
                            </ActionIcon>
                          </Tooltip>

                          {prod.is_active ? (
                            <Tooltip label="Deactivate product">
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                size="sm"
                                onClick={() => setProductToDeactivate(prod)}
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          ) : (
                            <Tooltip label="Already inactive">
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
        </Paper>
      </Box>

      {/* Create Product Modal */}
      <Modal
        opened={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        title={
          <Text fw={700} size="lg" c={textPrimary}>
            Add New Catalog Product
          </Text>
        }
        centered
        radius="md"
      >
        <form onSubmit={handleCreateSubmit}>
          <Stack gap="sm">
            {createServerError && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                {createServerError}
              </Alert>
            )}

            <TextInput
              label="Product Name"
              placeholder="e.g. TMT Steel Bars 16mm"
              required
              value={createName}
              onChange={(e) => setCreateName(e.currentTarget.value)}
              error={createErrors.name}
              description="Case-insensitive unique name in catalog"
            />

            <NumberInput
              label="Default Unit Price (Rs.)"
              placeholder="0.00"
              prefix="Rs. "
              required
              min={0}
              step={10}
              decimalScale={2}
              value={createPrice}
              onChange={(val) => setCreatePrice(val)}
              error={createErrors.price}
              description="Will auto-fill unit price on entry creation"
            />

            <Group justify="flex-end" mt="md" gap="sm">
              <Button variant="default" onClick={handleCloseCreateModal} disabled={createMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" color="blue" loading={createMutation.isPending}>
                Save Product
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Edit Product Modal */}
      <Modal
        opened={Boolean(productToEdit)}
        onClose={() => setProductToEdit(null)}
        title={
          <Text fw={700} size="lg" c={textPrimary}>
            Edit Catalog Product
          </Text>
        }
        centered
        radius="md"
      >
        <form onSubmit={handleEditSubmit}>
          <Stack gap="sm">
            {editServerError && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                {editServerError}
              </Alert>
            )}

            <TextInput
              label="Product Name"
              required
              value={editName}
              onChange={(e) => setEditName(e.currentTarget.value)}
              error={editErrors.name}
            />

            <NumberInput
              label="Default Unit Price (Rs.)"
              placeholder="0.00"
              prefix="Rs. "
              required
              min={0}
              step={10}
              decimalScale={2}
              value={editPrice}
              onChange={(val) => setEditPrice(val)}
              error={editErrors.price}
            />

            <Switch
              label="Product is active"
              checked={editActive}
              onChange={(e) => setEditActive(e.currentTarget.checked)}
              mt="xs"
            />

            <Group justify="flex-end" mt="md" gap="sm">
              <Button variant="default" onClick={() => setProductToEdit(null)} disabled={updateMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" color="blue" loading={updateMutation.isPending}>
                Update Product
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Deactivate Product Confirmation Modal */}
      <Modal
        opened={Boolean(productToDeactivate)}
        onClose={() => setProductToDeactivate(null)}
        title={
          <Text fw={700} c="red.7" size="md">
            Confirm Product Deactivation
          </Text>
        }
        centered
        radius="md"
      >
        <Stack gap="sm">
          <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light">
            Deactivating hides this product from new entry suggestions. All existing delivery entries referencing this product name will remain completely intact.
          </Alert>

          <Text size="sm">
            Are you sure you want to deactivate <b>{productToDeactivate?.name}</b>?
          </Text>

          <Group justify="flex-end" mt="md" gap="xs">
            <Button
              variant="default"
              onClick={() => setProductToDeactivate(null)}
              disabled={deactivateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={deactivateMutation.isPending}
              onClick={() => productToDeactivate && deactivateMutation.mutate(productToDeactivate.id)}
            >
              Deactivate Product
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
};
