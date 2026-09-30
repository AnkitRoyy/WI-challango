import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChallanPrintModal, formatWhatsAppPhone } from "./ChallanPrintModal";
import type { Entry } from "../api/entries";

const renderWithProviders = (ui: ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>{ui}</MantineProvider>
    </QueryClientProvider>
  );
};

const mockEntry: Entry = {
  id: 1,
  challan_no: "105",
  vehicle_no: "MP09AB1234",
  party_name: "Aman Construction",
  product: "Fly Ash Bricks 4-inch",
  quantity: 2000,
  unit_price: 5.5,
  total_price: 11000,
  subtotal: 11000,
  gst_type: "none",
  gst_rate: 0,
  gst_amount: 0,
  destination: "Bhawarkua, Indore",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
  created_by: 1,
};

describe("formatWhatsAppPhone", () => {
  it("formats standard 10-digit Indian numbers with 91 prefix", () => {
    expect(formatWhatsAppPhone("9034218483")).toBe("919034218483");
    expect(formatWhatsAppPhone("9812345678")).toBe("919812345678");
  });

  it("handles numbers with +91 or spaces or dashes", () => {
    expect(formatWhatsAppPhone("+91 90342-18483")).toBe("919034218483");
    expect(formatWhatsAppPhone("+919034218483")).toBe("919034218483");
  });

  it("handles numbers starting with leading 0", () => {
    expect(formatWhatsAppPhone("09034218483")).toBe("919034218483");
  });

  it("returns empty string when input is empty or has no digits", () => {
    expect(formatWhatsAppPhone("")).toBe("");
    expect(formatWhatsAppPhone("   ")).toBe("");
  });
});

describe("ChallanPrintModal WhatsApp Feature", () => {
  it("renders WhatsApp share button when modal is open", () => {
    renderWithProviders(
      <ChallanPrintModal
        opened={true}
        onClose={vi.fn()}
        entry={mockEntry}
      />
    );

    expect(screen.getByRole("button", { name: /WhatsApp/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download PDF/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Print Now/i })).toBeInTheDocument();
  });
});
