import React, { useEffect, useState, useCallback } from "react";
import {
  Modal,
  TextInput,
  NumberInput,
  Autocomplete,
  Checkbox,
  Button,
  Group,
  Stack,
  Alert,
  Text,
  Box,
  Loader,
  Badge,
  useMantineColorScheme as _unused,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconMapPin,
  IconBuildingStore,
  IconCalculator,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue, useMediaQuery } from "@mantine/hooks";
import {
  createEntryApi,
  updateEntryApi,
  type Entry,
  type EntryFormData,
} from "../api/entries";
import { fetchProductsApi, createProductApi } from "../api/products";
import { searchPlacesApi, type PlaceSuggestion } from "../api/places";
import { formatIndianCurrency } from "../utils/formatters";
import { useDarkTokens } from "../utils/useDarkTokens";

interface EntryFormModalProps {
  opened: boolean;
  onClose: () => void;
  entryToEdit?: Entry | null;
}

function hasDraft(
  serialNo: string,
  challanNo: string,
  vehicleNo: string,
  product: string,
  destination: string,
  quantity: number | string,
  unitPrice: number | string
) {
  return (
    serialNo.trim() !== "" ||
    challanNo.trim() !== "" ||
    vehicleNo.trim() !== "" ||
    product.trim() !== "" ||
    destination.trim() !== "" ||
    quantity !== "" ||
    unitPrice !== ""
  );
}

export const EntryFormModal: React.FC<EntryFormModalProps> = ({
  opened,
  onClose,
  entryToEdit,
}) => {
  const queryClient = useQueryClient();
  const isEditing = Boolean(entryToEdit);
  const isMobile = useMediaQuery("(max-width: 48em)");
  const t = useDarkTokens();
  const { isDark } = t;

  const [serialNo, setSerialNo] = useState("");
  const [challanNo, setChallanNo] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [product, setProduct] = useState("");
  const [destination, setDestination] = useState("");
  const [destinationLat, setDestinationLat] = useState<number | null>(null);
  const [destinationLng, setDestinationLng] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number | string>("");
  const [unitPrice, setUnitPrice] = useState<number | string>("");
  const [totalPrice, setTotalPrice] = useState<number>(0);
  const [saveToCatalog, setSaveToCatalog] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const [debouncedDest] = useDebouncedValue(destination, 450);
  const [destinationSuggestions, setDestinationSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProductsApi(),
    enabled: opened,
  });

  // Reset form when modal opens
  useEffect(() => {
    if (opened) {
      setServerError(null);
      setErrors({});
      setSaveToCatalog(false);
      setShowDiscardConfirm(false);
      if (entryToEdit) {
        setSerialNo(entryToEdit.serial_no);
        setChallanNo(entryToEdit.challan_no);
        setVehicleNo(entryToEdit.vehicle_no);
        setProduct(entryToEdit.product);
        setDestination(entryToEdit.destination || "");
        setDestinationLat(entryToEdit.destination_lat ?? null);
        setDestinationLng(entryToEdit.destination_lng ?? null);
        setQuantity(Number(entryToEdit.quantity));
        setUnitPrice(Number(entryToEdit.unit_price));
        setTotalPrice(Number(entryToEdit.quantity) * Number(entryToEdit.unit_price));
      } else {
        setSerialNo("");
        setChallanNo("");
        setVehicleNo("");
        setProduct("");
        setDestination("");
        setDestinationLat(null);
        setDestinationLng(null);
        setQuantity("");
        setUnitPrice("");
        setTotalPrice(0);
      }
    }
  }, [opened, entryToEdit]);

  // Recalculate total
  useEffect(() => {
    const q = typeof quantity === "number" ? quantity : parseFloat(quantity as string);
    const p = typeof unitPrice === "number" ? unitPrice : parseFloat(unitPrice as string);
    setTotalPrice(!isNaN(q) && !isNaN(p) && q > 0 && p >= 0 ? Math.round(q * p * 100) / 100 : 0);
  }, [quantity, unitPrice]);

  // Place autocomplete
  useEffect(() => {
    let active = true;
    if (!debouncedDest || debouncedDest.trim().length < 2) {
      setDestinationSuggestions([]);
      return;
    }
    setIsSearchingPlaces(true);
    searchPlacesApi(debouncedDest)
      .then((r) => { if (active) setDestinationSuggestions(r); })
      .finally(() => { if (active) setIsSearchingPlaces(false); });
    return () => { active = false; };
  }, [debouncedDest]);

  const isExistingProduct = (productsQuery.data || []).some(
    (p) => p.name.toLowerCase() === product.trim().toLowerCase()
  );
  const showSaveProductOption = product.trim().length > 0 && !isExistingProduct;

  const handleProductSelect = (val: string) => {
    setProduct(val);
    const found = (productsQuery.data || []).find(
      (p) => p.name.toLowerCase() === val.toLowerCase()
    );
    if (found) setUnitPrice(Number(found.default_unit_price));
  };

  const handleDestinationSelect = (val: string) => {
    setDestination(val);
    const matched = destinationSuggestions.find((s) => s.display_name === val);
    if (matched) {
      setDestinationLat(Number(matched.lat));
      setDestinationLng(Number(matched.lon));
    } else {
      setDestinationLat(null);
      setDestinationLng(null);
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!serialNo.trim()) e.serial_no = "Serial No is required";
    if (!challanNo.trim()) e.challan_no = "Challan No is required";
    if (!vehicleNo.trim()) e.vehicle_no = "Vehicle No is required";
    if (!product.trim()) e.product = "Product name is required";
    if (!destination.trim()) e.destination = "Destination is required";
    const q = typeof quantity === "number" ? quantity : parseFloat(quantity as string);
    if (quantity === "" || isNaN(q) || q <= 0) e.quantity = "Must be > 0";
    const p = typeof unitPrice === "number" ? unitPrice : parseFloat(unitPrice as string);
    if (unitPrice === "" || isNaN(p) || p < 0) e.unit_price = "Must be ≥ 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (saveToCatalog && product.trim() && !isExistingProduct) {
        try {
          await createProductApi({ name: product.trim(), default_unit_price: unitPrice !== "" ? Number(unitPrice) : 0 });
          queryClient.invalidateQueries({ queryKey: ["products"] });
        } catch { /* non-blocking */ }
      }
      const payload: EntryFormData = {
        serial_no: serialNo.trim(), challan_no: challanNo.trim(),
        vehicle_no: vehicleNo.trim(), product: product.trim(),
        destination: destination.trim(), destination_lat: destinationLat,
        destination_lng: destinationLng, quantity, unit_price: unitPrice,
      };
      return isEditing && entryToEdit ? updateEntryApi(entryToEdit.id, payload) : createEntryApi(payload);
    },
    onSuccess: (savedEntry) => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["entries-summary"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
      notifications.show({ title: isEditing ? "Updated" : "Created", message: `Challan ${savedEntry.challan_no} saved.`, color: "green", icon: <IconCheck size={18} /> });
      if (savedEntry.warning) notifications.show({ title: "Vehicle Advisory", message: savedEntry.warning, color: "yellow", icon: <IconAlertCircle size={18} />, autoClose: 7000 });
      onClose();
    },
    onError: (err: any) => {
      setServerError(err?.response?.data?.detail || err?.message || "Unexpected error.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (validate()) mutation.mutate();
  };

  const handleClose = useCallback(() => {
    if (!isEditing && hasDraft(serialNo, challanNo, vehicleNo, product, destination, quantity, unitPrice)) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [isEditing, serialNo, challanNo, vehicleNo, product, destination, quantity, unitPrice, onClose]);

  const inputStyles = {
    input: { minHeight: "44px", fontSize: "16px" }, // 16px prevents iOS zoom
    controls: { display: "none" as const },           // no stepper arrows
  };

  // Bottom nav is ~70px tall + safe-area. The modal footer must clear it.
  // On desktop there's no bottom nav so no extra padding needed.
  const BOTTOM_NAV_CLEARANCE = isMobile ? 78 : 0;

  return (
    <>
      <Modal
        opened={opened}
        onClose={handleClose}
        fullScreen={isMobile}
        title={
          <Text fw={700} size="sm" c={t.textPrimary}>
            {isEditing ? "✏️ Edit Challan Entry" : "📦 New Delivery Challan"}
          </Text>
        }
        size="lg"
        radius={isMobile ? 0 : "md"}
        centered={!isMobile}
        styles={{
          content: {
            display: "flex",
            flexDirection: "column",
            backgroundColor: t.surface,
            ...(isMobile
              ? { height: "100dvh", maxHeight: "100dvh", overflow: "hidden" }
              : {}),
          },
          header: { flexShrink: 0, backgroundColor: t.surface },
          // Body: take remaining height but don't scroll itself —
          // we handle scrolling inside with our own div
          body: {
            flex: 1,
            overflow: "hidden",       // ← important: keep this hidden
            padding: 0,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {/*
          ┌─────────────────────────────────────────┐
          │  SCROLLABLE FORM FIELDS (flex: 1, auto) │  ← scrolls
          ├─────────────────────────────────────────┤
          │  FIXED FOOTER (flexShrink: 0)           │  ← always visible
          └─────────────────────────────────────────┘
        */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            overflow: "hidden",       // form itself doesn't scroll
            minHeight: 0,
          }}
        >
          {/* ── Scrollable area ── */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              padding: isMobile ? "12px 16px" : "20px",
              minHeight: 0,           // needed for flex children to scroll
            }}
          >
            <Stack gap="sm">
              {serverError && (
                <Alert icon={<IconAlertCircle size={14} />} title="Save Failed" color="red" variant="light" py={6}>
                  <Text size="xs">{serverError}</Text>
                </Alert>
              )}

              {/* Serial No + Challan No */}
              <Group grow align="flex-start" gap="xs">
                <TextInput
                  label="Serial No"
                  placeholder="e.g. 001"
                  required
                  size="md"
                  value={serialNo}
                  onChange={(e) => setSerialNo(e.currentTarget.value)}
                  error={errors.serial_no}
                  styles={{ input: inputStyles.input }}
                />
                <TextInput
                  label="Challan No"
                  placeholder="e.g. CH-101"
                  required
                  size="md"
                  value={challanNo}
                  onChange={(e) => setChallanNo(e.currentTarget.value)}
                  error={errors.challan_no}
                  styles={{ input: inputStyles.input }}
                />
              </Group>

              {/* Vehicle No */}
              <TextInput
                label="Vehicle No"
                placeholder="e.g. DL 01 AB 1234"
                required
                size="md"
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.currentTarget.value)}
                error={errors.vehicle_no}
                styles={{ input: inputStyles.input }}
              />

              {/* Product */}
              <Box>
                <Autocomplete
                  label="Product"
                  placeholder="Select from catalog or type new..."
                  required
                  size="md"
                  value={product}
                  onChange={setProduct}
                  onOptionSubmit={handleProductSelect}
                  data={Array.from(new Set((productsQuery.data || []).map((p) => p.name.trim()).filter(Boolean)))}
                  renderOption={({ option }) => {
                    const prod = (productsQuery.data || []).find(
                      (p) => p.name.toLowerCase() === option.value.toLowerCase()
                    );
                    return (
                      <Group justify="space-between" w="100%">
                        <Text size="sm">{option.value}</Text>
                        {prod && <Badge size="xs" variant="light" color="blue">{formatIndianCurrency(prod.default_unit_price)}</Badge>}
                      </Group>
                    );
                  }}
                  error={errors.product}
                  leftSection={<IconBuildingStore size={16} color="#64748B" />}
                  styles={{ input: inputStyles.input }}
                />
                {showSaveProductOption && (
                  <Checkbox
                    size="xs"
                    label="Save to product catalog"
                    checked={saveToCatalog}
                    onChange={(e) => setSaveToCatalog(e.currentTarget.checked)}
                    color="blue"
                    mt={4}
                  />
                )}
              </Box>

              {/* Destination */}
              <Box>
                <Autocomplete
                  label="Destination"
                  placeholder="Search city or type site..."
                  required
                  size="md"
                  value={destination}
                  onChange={(val) => { setDestination(val); setDestinationLat(null); setDestinationLng(null); }}
                  onOptionSubmit={handleDestinationSelect}
                  data={Array.from(new Set(destinationSuggestions.map((s) => s.display_name.trim()).filter(Boolean)))}
                  error={errors.destination}
                  leftSection={<IconMapPin size={16} color={destinationLat ? "#16A34A" : "#64748B"} />}
                  rightSection={isSearchingPlaces ? <Loader size={14} color="blue" /> : undefined}
                  styles={{ input: inputStyles.input }}
                />
                {destinationLat !== null && destinationLng !== null && (
                  <Text size="10px" c="#16A34A" mt={2}>
                    📍 {destinationLat.toFixed(4)}, {destinationLng.toFixed(4)}
                  </Text>
                )}
              </Box>

              {/* Quantity + Unit Price */}
              <Group grow align="flex-start" gap="xs">
                <NumberInput
                  label="Quantity"
                  placeholder="0"
                  required
                  size="md"
                  min={0.01}
                  decimalScale={2}
                  value={quantity}
                  onChange={(val) => setQuantity(val)}
                  error={errors.quantity}
                  inputMode="decimal"
                  styles={inputStyles}
                />
                <NumberInput
                  label="Unit Price (₹)"
                  placeholder="0.00"
                  required
                  size="md"
                  min={0}
                  decimalScale={2}
                  value={unitPrice}
                  onChange={(val) => setUnitPrice(val)}
                  error={errors.unit_price}
                  inputMode="decimal"
                  styles={inputStyles}
                />
              </Group>

              {/* Total Price */}
              <Box
                p="sm"
                style={{
                  backgroundColor: isDark ? "#1E3A8A22" : "#EFF6FF",
                  borderRadius: 10,
                  border: isDark ? "1px solid #1E40AF" : "1px solid #BFDBFE",
                }}
              >
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <IconCalculator size={18} color="#2563EB" />
                    <Box>
                      <Text size="xs" fw={700} c={isDark ? "#93C5FD" : t.accent} tt="uppercase" lh={1.2}>
                        Total Price
                      </Text>
                      <Text size="10px" c="#60A5FA">Qty × Unit Price</Text>
                    </Box>
                  </Group>
                  <Text size="xl" fw={800} c={t.accent}>
                    {formatIndianCurrency(totalPrice)}
                  </Text>
                </Group>
              </Box>
            </Stack>
          </div>

          {/* ── Fixed footer — always visible above bottom nav ── */}
          <div
            style={{
              flexShrink: 0,
              padding: "10px 16px",
              // Extra padding pushes the buttons above the bottom nav bar
              paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${BOTTOM_NAV_CLEARANCE}px)`,
              backgroundColor: t.surface,
              borderTop: `1px solid ${t.border}`,
            }}
          >
            <Group justify="stretch" gap="xs">
              <Button
                variant="default"
                size="md"
                onClick={handleClose}
                disabled={mutation.isPending}
                style={{ flex: 1, minHeight: "44px" }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                color="blue"
                size="md"
                loading={mutation.isPending}
                style={{ flex: 2, minHeight: "44px" }}
              >
                {isEditing ? "Save Changes" : "Create Entry"}
              </Button>
            </Group>
          </div>
        </form>
      </Modal>

      {/* Discard Confirmation */}
      <Modal
        opened={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        title={<Text fw={700} size="sm">Discard unsaved entry?</Text>}
        size="xs"
        centered
        radius="md"
        styles={{
          content: { backgroundColor: t.surface },
          header: { backgroundColor: t.surface },
        }}
      >
        <Text size="sm" c="dimmed" mb="md">
          You've started filling in this entry. Closing now will lose your data.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" size="sm" onClick={() => setShowDiscardConfirm(false)}>
            Keep Editing
          </Button>
          <Button color="red" size="sm" onClick={() => { setShowDiscardConfirm(false); onClose(); }}>
            Discard & Close
          </Button>
        </Group>
      </Modal>
    </>
  );
};
