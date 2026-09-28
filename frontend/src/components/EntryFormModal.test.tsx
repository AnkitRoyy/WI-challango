import type { ReactElement } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EntryFormModal } from "./EntryFormModal";

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

describe("EntryFormModal", () => {
  it("renders all form fields when opened", () => {
    renderWithProviders(<EntryFormModal opened={true} onClose={vi.fn()} />);

    expect(screen.getByLabelText(/Serial No/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Challan No/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Vehicle No/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Product/i)[0]).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Destination/i)[0]).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Unit Price/i)).toBeInTheDocument();
  });

  it("calculates total price live when quantity and unit price are provided", () => {
    renderWithProviders(<EntryFormModal opened={true} onClose={vi.fn()} />);

    const qtyInput = screen.getByLabelText(/Quantity/i);
    const priceInput = screen.getByLabelText(/Unit Price/i);

    // Initial total is 0.00
    expect(screen.getByText("Rs. 0.00")).toBeInTheDocument();

    // Type Quantity: 100
    fireEvent.change(qtyInput, { target: { value: "100" } });
    // Type Unit Price: 1250
    fireEvent.change(priceInput, { target: { value: "1250" } });

    // Live calculation: 100 * 1250 = 1,25,000.00
    expect(screen.getByText("Rs. 1,25,000.00")).toBeInTheDocument();
  });

  it("shows client-side validation errors when required fields are missing on submit", async () => {
    renderWithProviders(<EntryFormModal opened={true} onClose={vi.fn()} />);

    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    expect(await screen.findByText("Serial No is required")).toBeInTheDocument();
    expect(screen.getByText("Challan No is required")).toBeInTheDocument();
    expect(screen.getByText("Vehicle No is required")).toBeInTheDocument();
    expect(screen.getByText("Product name is required")).toBeInTheDocument();
    expect(screen.getByText("Destination is required")).toBeInTheDocument();
  });
});
