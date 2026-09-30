import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Modal,
  TextInput,
  NumberInput,
  Autocomplete,
  SegmentedControl,
  Checkbox,
  Button,
  Group,
  Stack,
  Alert,
  Text,
  Box,
  Loader,
  Badge,
  Divider,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconMapPin,
  IconBuildingStore,
  IconCalculator,
  IconReceiptTax,
  IconUser,
  IconRefresh,
  IconPrinter,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue, useMediaQuery } from "@mantine/hooks";
import {
  createEntryApi,
  updateEntryApi,
  getVehicleSuggestionsApi,
  fetchNextChallanNoApi,
  type Entry,
  type EntryFormData,
} from "../api/entries";
import { fetchProductsApi, createProductApi } from "../api/products";
import { fetchPartiesApi, type Party } from "../api/parties";
import { searchPlacesApi, type PlaceSuggestion } from "../api/places";
import { formatIndianCurrency } from "../utils/formatters";
import { useDarkTokens } from "../utils/useDarkTokens";
import { ChallanPrintModal } from "./ChallanPrintModal";

interface EntryFormModalProps {
  opened: boolean;
  onClose: () => void;
  entryToEdit?: Entry | null;
}

// Only count fields the USER manually fills — challanNo is auto-populated so excluded
function hasDraft(
  vehicleNo: string,
  product: string,
  destination: string,
  partyName: string,
  quantity: number | string,
  unitPrice: number | string
) {
  return (
    vehicleNo.trim() !== "" ||
    product.trim() !== "" ||
    destination.trim() !== "" ||
    partyName.trim() !== "" ||
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

  const [challanNo, setChallanNo] = useState("");
  const [seriesType, setSeriesType] = useState<"own" | "party">("own");
  const [isAutoFetchingChallan, setIsAutoFetchingChallan] = useState(false);
  const [vehicleNo, setVehicleNo] = useState("");
  const [partyName, setPartyName] = useState("");
  const [product, setProduct] = useState("");
  const [destination, setDestination] = useState("");
  const [destinationLat, setDestinationLat] = useState<number | null>(null);
  const [destinationLng, setDestinationLng] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number | string>("");
  const [unitPrice, setUnitPrice] = useState<number | string>("");
  const [gstType, setGstType] = useState<string>("none");
  const [gstRate, setGstRate] = useState<number | string>(18);
  const [subtotal, setSubtotal] = useState<number>(0);
  const [gstAmount, setGstAmount] = useState<number>(0);
  const [totalPrice, setTotalPrice] = useState<number>(0);
  const [saveToCatalog, setSaveToCatalog] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const [debouncedVehicle] = useDebouncedValue(vehicleNo, 300);
  const [vehicleSuggestions, setVehicleSuggestions] = useState<string[]>([]);
  const [isSearchingVehicles, setIsSearchingVehicles] = useState(false);

  const [debouncedDest] = useDebouncedValue(destination, 250);
  const [destinationSuggestions, setDestinationSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const [isPrintAction, setIsPrintAction] = useState(false);
  const [printModalOpened, setPrintModalOpened] = useState(false);
  const [savedChallanForPrint, setSavedChallanForPrint] = useState<Entry | null>(null);
  const [matchedPartyForPrint, setMatchedPartyForPrint] = useState<Party | null>(null);

  const isFormComplete = Boolean(
    challanNo.trim() &&
    vehicleNo.trim() &&
    partyName.trim() &&
    product.trim() &&
    (typeof quantity === "number" ? quantity > 0 : parseFloat(quantity as string) > 0) &&
    (typeof unitPrice === "number" ? unitPrice >= 0 : parseFloat(unitPrice as string) >= 0)
  );

  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProductsApi(),
    enabled: opened,
  });

  const partiesQuery = useQuery({
    queryKey: ["parties"],
    queryFn: () => fetchPartiesApi(),
    enabled: opened,
  });

  const loadNextChallanNo = useCallback(
    async (targetSeries: "own" | "party", targetPartyName?: string) => {
      setIsAutoFetchingChallan(true);
      try {
        let partyId: number | undefined;
        const pName = (targetPartyName !== undefined ? targetPartyName : partyName).trim();
        if (targetSeries === "party" && pName) {
          const matched = (partiesQuery.data || []).find(
            (p) =>
              (p.trade_name && p.trade_name.toLowerCase() === pName.toLowerCase()) ||
              p.name.toLowerCase() === pName.toLowerCase()
          );
          partyId = matched?.id;
        }

        const res = await fetchNextChallanNoApi({
          series_type: targetSeries,
          party_id: partyId,
          party_name: pName || undefined,
        });

        if (res.next_challan_no) {
          setChallanNo(res.next_challan_no);
        }
      } catch (err) {
        console.error("Failed to fetch next challan number:", err);
      } finally {
        setIsAutoFetchingChallan(false);
      }
    },
    [partiesQuery.data, partyName]
  );

  const handleSeriesChange = (val: string) => {
    const nextSeries = val as "own" | "party";
    setSeriesType(nextSeries);
    if (nextSeries === "party" && !partyName.trim()) {
      setChallanNo("");
    } else {
      loadNextChallanNo(nextSeries, partyName);
    }
  };

  // Reset form when modal opens
  useEffect(() => {
    if (opened) {
      setServerError(null);
      setErrors({});
      setSaveToCatalog(false);
      setIsPrintAction(false);
      setShowDiscardConfirm(false);
      if (entryToEdit) {
        setSeriesType((entryToEdit.challan_series as "own" | "party") || "own");
        setChallanNo(entryToEdit.challan_no);
        setVehicleNo(entryToEdit.vehicle_no);
        setPartyName(entryToEdit.party_name || "");
        setProduct(entryToEdit.product);
        setDestination(entryToEdit.destination || "");
        setDestinationLat(entryToEdit.destination_lat ?? null);
        setDestinationLng(entryToEdit.destination_lng ?? null);
        setQuantity(Number(entryToEdit.quantity));
        setUnitPrice(Number(entryToEdit.unit_price));
        setGstType(entryToEdit.gst_type || "none");
        setGstRate(entryToEdit.gst_rate !== undefined && entryToEdit.gst_rate !== null ? Number(entryToEdit.gst_rate) : 18);
        setSubtotal(Number(entryToEdit.subtotal || entryToEdit.total_price));
        setGstAmount(Number(entryToEdit.gst_amount || 0));
        setTotalPrice(Number(entryToEdit.total_price));
      } else {
        setSeriesType("own");
        setChallanNo("");
        setVehicleNo("");
        setPartyName("");
        setProduct("");
        setDestination("");
        setDestinationLat(null);
        setDestinationLng(null);
        setQuantity("");
        setUnitPrice("");
        setGstType("none");
        setGstRate(18);
        setSubtotal(0);
        setGstAmount(0);
        setTotalPrice(0);
        loadNextChallanNo("own", "");
      }
    }
  }, [opened, entryToEdit]);

  // ── Body scroll-lock cleanup ──────────────────────────────────────────────
  // Mantine's Modal sets overflow:hidden on <body> when open. If it fails to
  // clean up (nested modals, portal timing), the page stays frozen. Force-reset.
  useEffect(() => {
    if (!opened) {
      // Small delay so Mantine's own cleanup runs first, then we force it.
      const id = setTimeout(() => {
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
        document.documentElement.style.overflow = "";
      }, 80);
      return () => clearTimeout(id);
    }
  }, [opened]);

  // Recalculate subtotal, gstAmount, and totalPrice
  useEffect(() => {
    const q = typeof quantity === "number" ? quantity : parseFloat(quantity as string);
    const p = typeof unitPrice === "number" ? unitPrice : parseFloat(unitPrice as string);
    const r = typeof gstRate === "number" ? gstRate : parseFloat(gstRate as string);

    if (!isNaN(q) && !isNaN(p) && q > 0 && p >= 0) {
      const sub = Math.round(q * p * 100) / 100;
      setSubtotal(sub);

      if (gstType !== "none" && !isNaN(r) && r > 0) {
        const gst = Math.round(sub * (r / 100) * 100) / 100;
        setGstAmount(gst);
        setTotalPrice(Math.round((sub + gst) * 100) / 100);
      } else {
        setGstAmount(0);
        setTotalPrice(sub);
      }
    } else {
      setSubtotal(0);
      setGstAmount(0);
      setTotalPrice(0);
    }
  }, [quantity, unitPrice, gstType, gstRate]);

  // Vehicle autocomplete suggestions (prefetches recent 10 on modal open and updates on search)
  const fetchVehicleSuggestions = useCallback((q: string) => {
    setIsSearchingVehicles(true);
    getVehicleSuggestionsApi(q.trim())
      .then((r) => {
        setVehicleSuggestions(Array.isArray(r) ? r : []);
      })
      .catch(() => {
        setVehicleSuggestions([]);
      })
      .finally(() => {
        setIsSearchingVehicles(false);
      });
  }, []);

  useEffect(() => {
    if (!opened) return;
    fetchVehicleSuggestions(debouncedVehicle || "");
  }, [opened, debouncedVehicle, fetchVehicleSuggestions]);

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

  const partyOptions = useMemo(() => {
    return Array.from(
      new Set(
        (partiesQuery.data || [])
          .map((p) => (p.trade_name || p.name).trim())
          .filter(Boolean)
      )
    );
  }, [partiesQuery.data]);

  const filterPartyOptions = useCallback(
    ({ options, search }: { options: any[]; search: string }) => {
      const q = search.trim().toLowerCase();
      if (!q) return options;
      return options.filter((opt) => {
        const val = (typeof opt === "string" ? opt : opt.value || opt.label || "").toLowerCase();
        if (val.includes(q)) return true;
        const p = (partiesQuery.data || []).find(
          (item) => (item.trade_name || item.name).trim().toLowerCase() === val
        );
        if (!p) return false;
        return Boolean(
          (p.legal_name && p.legal_name.toLowerCase().includes(q)) ||
          (p.gst_number && p.gst_number.toLowerCase().includes(q)) ||
          (p.phone && p.phone.toLowerCase().includes(q)) ||
          (p.state && p.state.toLowerCase().includes(q)) ||
          (p.address && p.address.toLowerCase().includes(q))
        );
      });
    },
    [partiesQuery.data]
  );

  const productOptions = useMemo(() => {
    return Array.from(
      new Set(
        (productsQuery.data || [])
          .map((p) => p.name.trim())
          .filter(Boolean)
      )
    );
  }, [productsQuery.data]);

  const destinationOptions = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();

    for (const s of destinationSuggestions) {
      const name = s.display_name?.trim();
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        list.push(name);
      }
    }

    const q = destination.trim().toLowerCase();
    for (const p of partiesQuery.data || []) {
      const addr = (p.address || "").trim();
      if (addr && !seen.has(addr.toLowerCase())) {
        if (!q || addr.toLowerCase().includes(q)) {
          seen.add(addr.toLowerCase());
          list.push(addr);
        }
      }
      const st = (p.state || "").trim();
      if (st && !seen.has(st.toLowerCase())) {
        if (!q || st.toLowerCase().includes(q)) {
          seen.add(st.toLowerCase());
          list.push(st);
        }
      }
    }

    return list;
  }, [destinationSuggestions, partiesQuery.data, destination]);

  const isExistingProduct = (productsQuery.data || []).some(
    (p) => p.name.toLowerCase() === product.trim().toLowerCase()
  );
  const showSaveProductOption = product.trim().length > 0 && !isExistingProduct;

  const handlePartySelect = (val: string) => {
    setPartyName(val);
    const party = (partiesQuery.data || []).find(
      (p) =>
        (p.trade_name && p.trade_name.toLowerCase() === val.toLowerCase()) ||
        p.name.toLowerCase() === val.toLowerCase() ||
        (p.legal_name && p.legal_name.toLowerCase() === val.toLowerCase())
    );
    if (party) {
      const dest = party.address || party.state;
      if (dest) {
        setDestination(dest);
        setErrors((prev) => {
          const next = { ...prev };
          delete next.destination;
          delete next.party_name;
          return next;
        });
      }
    }
    if (seriesType === "party") {
      loadNextChallanNo("party", val);
    }
  };

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
    if (!challanNo.trim()) e.challan_no = "Challan No is required";
    if (!vehicleNo.trim()) e.vehicle_no = "Vehicle No is required";
    if (!partyName.trim()) e.party_name = "Party / Customer is required";
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
        challan_no: challanNo.trim(),
        challan_series: seriesType,
        vehicle_no: vehicleNo.trim(),
        party_name: partyName.trim() || null,
        product: product.trim(),
        destination: destination.trim(),
        destination_lat: destinationLat,
        destination_lng: destinationLng,
        quantity,
        unit_price: unitPrice,
        gst_type: gstType,
        gst_rate: gstType !== "none" ? gstRate : null,
      };
      return isEditing && entryToEdit ? updateEntryApi(entryToEdit.id, payload) : createEntryApi(payload);
    },
    onSuccess: (savedEntry) => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["entries-summary"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
      notifications.show({ title: isEditing ? "Updated" : "Created", message: `Challan ${savedEntry.challan_no} saved.`, color: "green", icon: <IconCheck size={18} /> });
      if (savedEntry.warning) notifications.show({ title: "Vehicle Advisory", message: savedEntry.warning, color: "yellow", icon: <IconAlertCircle size={18} />, autoClose: 7000 });
      if (isPrintAction) {
        const pName = savedEntry.party_name || partyName;
        const matched = (partiesQuery.data || []).find(
          (p) =>
            (p.trade_name && p.trade_name.toLowerCase() === pName.trim().toLowerCase()) ||
            p.name.toLowerCase() === pName.trim().toLowerCase()
        );
        setSavedChallanForPrint(savedEntry);
        setMatchedPartyForPrint(matched || null);
        setPrintModalOpened(true);
      }
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || "Unexpected error.";
      setServerError(msg);
      notifications.show({
        title: "Save Failed",
        message: msg,
        color: "red",
        icon: <IconAlertCircle size={18} />,
        autoClose: 7000,
      });
      if (typeof msg === "string" && msg.toLowerCase().includes("challan no")) {
        setErrors((prev) => ({ ...prev, challan_no: msg }));
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (validate()) mutation.mutate();
  };

  const handleClose = useCallback(() => {
    if (!isEditing && hasDraft(vehicleNo, product, destination, partyName, quantity, unitPrice)) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [isEditing, vehicleNo, product, destination, partyName, quantity, unitPrice, onClose]);

  const commonComboboxProps = {
    zIndex: 1000,
    withinPortal: true,
    shadow: "md" as const,
  };

  const inputStyles = {
    input: { minHeight: "44px", fontSize: "16px" }, // 16px prevents iOS zoom
    controls: { display: "none" as const },           // no stepper arrows
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={handleClose}
        fullScreen={isMobile}
        zIndex={400}
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
            overflow: "hidden",
            minHeight: 0,
            position: "relative",      // needed for the discard overlay
          }}
        >
          {/* ── Discard Confirm Overlay (floats on top of form, same modal) ── */}
          {showDiscardConfirm && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
                backgroundColor: t.isDark ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.72)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }}
            >
              <Box
                style={{
                  backgroundColor: t.surface,
                  border: `1px solid ${t.border}`,
                  borderRadius: 12,
                  padding: "24px 20px",
                  width: "100%",
                  maxWidth: 300,
                  textAlign: "center",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
                }}
              >
                <Text style={{ fontSize: 32, lineHeight: 1, marginBottom: 12 }}>⚠️</Text>
                <Text fw={700} size="md" c={t.textPrimary} mb={6}>Discard this entry?</Text>
                <Text size="xs" c={t.textSecondary} mb={20}>
                  You've started filling in this challan. Closing now will lose your changes.
                </Text>
                <Stack gap="xs">
                  <Button
                    fullWidth
                    size="sm"
                    variant="default"
                    onClick={() => setShowDiscardConfirm(false)}
                    style={{ minHeight: 40 }}
                  >
                    Keep Editing
                  </Button>
                  <Button
                    fullWidth
                    size="sm"
                    color="red"
                    onClick={() => { setShowDiscardConfirm(false); onClose(); }}
                    style={{ minHeight: 40 }}
                  >
                    Discard & Close
                  </Button>
                </Stack>
              </Box>
            </div>
          )}
          {/* ── Scrollable area ── */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
              overscrollBehavior: "contain",
              padding: isMobile ? "14px 16px 54px 16px" : "20px 20px 44px 20px",
              minHeight: 0,
            }}
          >
            <Stack gap="sm">
              {serverError && (
                <Alert icon={<IconAlertCircle size={15} />} title="Save Failed" color="red" variant="light" py={8}>
                  <Stack gap="xs">
                    <Text size="xs">{serverError}</Text>
                    {serverError.toLowerCase().includes("already exists") && (
                      <Group gap="xs">
                        <Button
                          size="xs"
                          color="red"
                          variant="filled"
                          onClick={() => {
                            setServerError(null);
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.challan_no;
                              return next;
                            });
                            loadNextChallanNo(seriesType, partyName);
                          }}
                        >
                          Auto-generate next unique Challan No
                        </Button>
                      </Group>
                    )}
                  </Stack>
                </Alert>
              )}

              {/* Challan No with integrated minimal series selector */}
              <TextInput
                label={
                  <Group justify="space-between" align="center" style={{ width: "100%" }}>
                    <span>Challan No</span>
                    {isAutoFetchingChallan && <Loader size={12} />}
                  </Group>
                }
                placeholder={seriesType === "own" ? "e.g. 1" : !partyName.trim() ? "Select party below..." : "e.g. 1001"}
                required
                size="md"
                value={challanNo}
                onChange={(e) => setChallanNo(e.currentTarget.value)}
                error={errors.challan_no}
                leftSectionPointerEvents="all"
                leftSectionWidth={116}
                leftSection={
                  <SegmentedControl
                    size="xs"
                    radius="sm"
                    value={seriesType}
                    onChange={handleSeriesChange}
                    data={[
                      { value: "own", label: "WI" },
                      { value: "party", label: "Buyer" },
                    ]}
                    styles={{
                      root: {
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                        padding: "2px",
                      },
                      label: {
                        padding: "3px 8px",
                        fontSize: "11px",
                        fontWeight: 600,
                        lineHeight: 1.2,
                      },
                      control: {
                        border: "none",
                      },
                    }}
                  />
                }
                rightSection={
                  <Tooltip label="Auto-calculate next sequence">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      color="blue"
                      onClick={() => loadNextChallanNo(seriesType, partyName)}
                      loading={isAutoFetchingChallan}
                    >
                      <IconRefresh size={14} />
                    </ActionIcon>
                  </Tooltip>
                }
                styles={{
                  input: {
                    ...inputStyles.input,
                    paddingLeft: "124px",
                  },
                }}
              />

              {/* Yellow note when Buyer series is selected but party is not chosen yet */}
              {seriesType === "party" && !partyName.trim() && (
                <Alert
                  icon={<IconAlertCircle size={15} />}
                  color="yellow"
                  variant="light"
                  py={6}
                  px={10}
                  radius="sm"
                  styles={{
                    root: { marginTop: -4 },
                    icon: { marginRight: 8 },
                    message: { fontSize: "12px", lineHeight: 1.35 },
                  }}
                >
                  Please select a party below to fetch and sync their challan details.
                </Alert>
              )}

              {/* Vehicle No */}
              <Autocomplete
                label="Vehicle No"
                placeholder="e.g. DL 01 AB 1234"
                required
                size="md"
                value={vehicleNo}
                onChange={setVehicleNo}
                onFocus={() => {
                  if (vehicleSuggestions.length === 0) {
                    fetchVehicleSuggestions(vehicleNo);
                  }
                }}
                data={vehicleSuggestions}
                filter={({ options }) => options}
                comboboxProps={commonComboboxProps}
                maxDropdownHeight={240}
                limit={15}
                error={errors.vehicle_no}
                rightSection={isSearchingVehicles ? <Loader size="xs" /> : undefined}
                styles={{ input: inputStyles.input }}
              />

              {/* Party / Customer */}
              <Autocomplete
                label="Party / Customer"
                placeholder="Select party or type new customer..."
                required
                size="md"
                value={partyName}
                onChange={(val) => {
                  setPartyName(val);
                  if (errors.party_name) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.party_name;
                      return next;
                    });
                  }
                  // If exact match with an existing party, also prefill destination if empty
                  const matched = (partiesQuery.data || []).find(
                    (p) =>
                      (p.trade_name && p.trade_name.toLowerCase() === val.trim().toLowerCase()) ||
                      p.name.toLowerCase() === val.trim().toLowerCase()
                  );
                  if (matched) {
                    if (!destination.trim()) {
                      const dest = matched.address || matched.state;
                      if (dest) setDestination(dest);
                    }
                    if (seriesType === "party") {
                      loadNextChallanNo("party", val);
                    }
                  }
                }}
                onOptionSubmit={handlePartySelect}
                data={partyOptions}
                filter={filterPartyOptions}
                comboboxProps={commonComboboxProps}
                maxDropdownHeight={260}
                limit={25}
                renderOption={({ option }) => {
                  const party = (partiesQuery.data || []).find(
                    (p) =>
                      (p.trade_name || p.name).toLowerCase() === option.value.toLowerCase() ||
                      p.name.toLowerCase() === option.value.toLowerCase()
                  );
                  return (
                    <Group justify="space-between" w="100%">
                      <Box>
                        <Text size="sm">{option.value}</Text>
                        {party?.legal_name && party.legal_name !== (party.trade_name || party.name) && (
                          <Text size="10px" c="dimmed">
                            Legal: {party.legal_name}
                          </Text>
                        )}
                        {party?.phone && (
                          <Text size="10px" c="dimmed">
                            📞 {party.phone}
                          </Text>
                        )}
                      </Box>
                      <Group gap="xs">
                        {party?.state && (
                          <Badge size="xs" variant="light" color="cyan">
                            {party.state}
                          </Badge>
                        )}
                        {party?.gst_number && (
                          <Badge size="xs" variant="outline" color="gray">
                            {party.gst_number}
                          </Badge>
                        )}
                      </Group>
                    </Group>
                  );
                }}
                leftSection={<IconUser size={16} color="#64748B" />}
                error={errors.party_name}
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
                  data={productOptions}
                  comboboxProps={commonComboboxProps}
                  maxDropdownHeight={260}
                  limit={25}
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
                  data={destinationOptions}
                  filter={({ options }) => options}
                  comboboxProps={commonComboboxProps}
                  maxDropdownHeight={260}
                  limit={15}
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

              {/* GST Type & Rate Settings */}
              <Box
                p="xs"
                style={{
                  backgroundColor: isDark ? "#1E293B" : "#F8FAFC",
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                }}
              >
                <Stack gap="xs">
                  <Group justify="space-between" align="center">
                    <Group gap={6}>
                      <IconReceiptTax size={16} color="#3B82F6" />
                      <Text size="xs" fw={700} tt="uppercase" c={t.textPrimary}>GST Settings</Text>
                    </Group>
                    {gstType !== "none" && (
                      <Badge size="xs" color="blue" variant="light">
                        {gstType === "cgst_sgst" ? "CGST + SGST" : "IGST"} ({gstRate}%)
                      </Badge>
                    )}
                  </Group>

                  <SegmentedControl
                    value={gstType}
                    onChange={setGstType}
                    data={[
                      { label: "None (0%)", value: "none" },
                      { label: "CGST + SGST (Intra-state)", value: "cgst_sgst" },
                      { label: "IGST (Inter-state)", value: "igst" },
                    ]}
                    size="xs"
                    fullWidth
                  />

                  {gstType !== "none" && (
                    <Stack gap={6} mt={2}>
                      <Text size="xs" c="dimmed">Select GST Rate:</Text>
                      <Group gap={6}>
                        {[5, 12, 18, 28].map((rate) => (
                          <Button
                            key={rate}
                            size="xs"
                            variant={Number(gstRate) === rate ? "filled" : "outline"}
                            color="blue"
                            onClick={() => setGstRate(rate)}
                            style={{ flex: 1 }}
                          >
                            {rate}%
                          </Button>
                        ))}
                      </Group>
                      <NumberInput
                        size="xs"
                        label="Custom Rate (%)"
                        placeholder="e.g. 18"
                        min={0}
                        max={100}
                        decimalScale={2}
                        value={gstRate}
                        onChange={(val) => setGstRate(val)}
                        styles={{ input: { fontSize: "14px" } }}
                      />
                    </Stack>
                  )}
                </Stack>
              </Box>

              {/* Pricing Breakdown Card */}
              <Box
                p="sm"
                style={{
                  backgroundColor: isDark ? "#1E3A8A22" : "#EFF6FF",
                  borderRadius: 10,
                  border: isDark ? "1px solid #1E40AF" : "1px solid #BFDBFE",
                }}
              >
                <Stack gap={6}>
                  <Group justify="space-between" align="center">
                    <Text size="xs" c={t.textSecondary}>Subtotal (Qty × Price)</Text>
                    <Text size="sm" fw={600} c={t.textPrimary}>
                      {formatIndianCurrency(subtotal)}
                    </Text>
                  </Group>

                  {gstType !== "none" && gstAmount > 0 && (
                    <>
                      {gstType === "cgst_sgst" ? (
                        <>
                          <Group justify="space-between" align="center">
                            <Text size="xs" c="dimmed">
                              CGST ({Number(gstRate) / 2}%)
                            </Text>
                            <Text size="xs" fw={500} c={t.textSecondary}>
                              {formatIndianCurrency(gstAmount / 2)}
                            </Text>
                          </Group>
                          <Group justify="space-between" align="center">
                            <Text size="xs" c="dimmed">
                              SGST ({Number(gstRate) / 2}%)
                            </Text>
                            <Text size="xs" fw={500} c={t.textSecondary}>
                              {formatIndianCurrency(gstAmount / 2)}
                            </Text>
                          </Group>
                        </>
                      ) : (
                        <Group justify="space-between" align="center">
                          <Text size="xs" c="dimmed">
                            IGST ({gstRate}%)
                          </Text>
                          <Text size="xs" fw={500} c={t.textSecondary}>
                            {formatIndianCurrency(gstAmount)}
                          </Text>
                        </Group>
                      )}
                    </>
                  )}

                  <Divider my={4} color={isDark ? "#1E40AF" : "#BFDBFE"} />

                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <IconCalculator size={18} color="#2563EB" />
                      <Box>
                        <Text size="xs" fw={700} c={isDark ? "#93C5FD" : t.accent} tt="uppercase" lh={1.2}>
                          Total Price
                        </Text>
                        <Text size="10px" c="#60A5FA">
                          {gstType !== "none" ? "Subtotal + GST" : "Qty × Unit Price"}
                        </Text>
                      </Box>
                    </Group>
                    <Text size="xl" fw={800} c={t.accent}>
                      {formatIndianCurrency(totalPrice)}
                    </Text>
                  </Group>
                </Stack>
              </Box>
            </Stack>
          </div>

          {/* ── Fixed footer — always visible above safe area ── */}
          <div
            style={{
              flexShrink: 0,
              padding: isMobile ? "10px 14px" : "12px 20px",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
              backgroundColor: t.surface,
              borderTop: `1px solid ${t.border}`,
            }}
          >
            {isMobile ? (
              <Stack gap={8} w="100%">
                <Group grow gap="xs">
                  <Tooltip
                    label={
                      !isFormComplete
                        ? "Fill all required details to enable Save & Print"
                        : "Save and print thermal challan (Epson TM-P80)"
                    }
                  >
                    <Button
                      type="button"
                      color="teal"
                      size="sm"
                      leftSection={<IconPrinter size={16} />}
                      loading={mutation.isPending && isPrintAction}
                      disabled={!isFormComplete || mutation.isPending}
                      onClick={() => {
                        setIsPrintAction(true);
                        setServerError(null);
                        if (validate()) mutation.mutate();
                      }}
                      style={{
                        minHeight: "44px",
                        fontSize: "13px",
                        padding: "0 6px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Save & Print
                    </Button>
                  </Tooltip>

                  <Button
                    type="button"
                    color="blue"
                    size="sm"
                    loading={mutation.isPending && !isPrintAction}
                    disabled={mutation.isPending}
                    onClick={() => {
                      setIsPrintAction(false);
                      setServerError(null);
                      if (validate()) mutation.mutate();
                    }}
                    style={{
                      minHeight: "44px",
                      fontSize: "13px",
                      padding: "0 6px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isEditing ? "Save Changes" : "Create Entry"}
                  </Button>
                </Group>

                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  onClick={handleClose}
                  disabled={mutation.isPending}
                  style={{ minHeight: "36px", color: t.textSecondary }}
                >
                  Cancel
                </Button>
              </Stack>
            ) : (
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
                <Tooltip
                  label={
                    !isFormComplete
                      ? "Fill all required details to enable Save & Print"
                      : "Save and print 80mm thermal challan (Epson TM-P80)"
                  }
                >
                  <Button
                    type="button"
                    color="teal"
                    size="md"
                    leftSection={<IconPrinter size={16} />}
                    loading={mutation.isPending && isPrintAction}
                    disabled={!isFormComplete || mutation.isPending}
                    onClick={() => {
                      setIsPrintAction(true);
                      setServerError(null);
                      if (validate()) mutation.mutate();
                    }}
                    style={{ flex: 1.5, minHeight: "44px" }}
                  >
                    Save & Print
                  </Button>
                </Tooltip>
                <Button
                  type="button"
                  color="blue"
                  size="md"
                  loading={mutation.isPending && !isPrintAction}
                  disabled={mutation.isPending}
                  onClick={() => {
                    setIsPrintAction(false);
                    setServerError(null);
                    if (validate()) mutation.mutate();
                  }}
                  style={{ flex: 1.5, minHeight: "44px" }}
                >
                  {isEditing ? "Save Changes" : "Create Entry"}
                </Button>
              </Group>
            )}
          </div>
        </form>
      </Modal>

      {/* ── Thermal Challan Print Modal (Epson TM-P80 / 80mm) ── */}
      <ChallanPrintModal
        opened={printModalOpened}
        onClose={() => {
          setPrintModalOpened(false);
          setSavedChallanForPrint(null);
          setMatchedPartyForPrint(null);
        }}
        entry={savedChallanForPrint}
        party={matchedPartyForPrint}
        autoPrint={true}
      />
    </>
  );
};
