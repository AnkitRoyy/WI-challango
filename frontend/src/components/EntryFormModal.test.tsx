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

    expect(screen.getByLabelText(/Challan No/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Vehicle No/i)[0]).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Party/i)[0]).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Product/i)[0]).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Destination/i)[0]).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Unit Price/i)).toBeInTheDocument();
  });

  it("calculates total price live when quantity and unit price are provided", () => {
    renderWithProviders(<EntryFormModal opened={true} onClose={vi.fn()} />);

    const qtyInput = screen.getByLabelText(/Quantity/i);
    const priceInput = screen.getByLabelText(/Unit Price/i);

    // Initial total is 0.00 (shown in subtotal and total breakdown)
    expect(screen.getAllByText("Rs. 0.00").length).toBeGreaterThanOrEqual(1);

    // Type Quantity: 100
    fireEvent.change(qtyInput, { target: { value: "100" } });
    // Type Unit Price: 1250
    fireEvent.change(priceInput, { target: { value: "1250" } });

    // Live calculation: 100 * 1250 = 1,25,000.00
    expect(screen.getAllByText("Rs. 1,25,000.00")[0]).toBeInTheDocument();
  });

  it("shows client-side validation errors when required fields are missing on submit", async () => {
    renderWithProviders(<EntryFormModal opened={true} onClose={vi.fn()} />);

    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    expect(await screen.findByText("Challan No is required")).toBeInTheDocument();
    expect(screen.getByText("Vehicle No is required")).toBeInTheDocument();
    expect(screen.getByText("Party / Customer is required")).toBeInTheDocument();
    expect(screen.getByText("Product name is required")).toBeInTheDocument();
    expect(screen.getByText("Destination is required")).toBeInTheDocument();
  });

  it("renders 3 options: Cancel, Save & Print, and Create Entry with Save & Print disabled until details are added", () => {
    renderWithProviders(<EntryFormModal opened={true} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^create entry$/i })).toBeInTheDocument();

    const saveAndPrintBtn = screen.getByRole("button", { name: /save & print/i });
    expect(saveAndPrintBtn).toBeInTheDocument();
    // Initially disabled because details are empty
    expect(saveAndPrintBtn).toBeDisabled();

    // Fill all details
    fireEvent.change(screen.getByLabelText(/Challan No/i), { target: { value: "1001" } });
    fireEvent.change(screen.getAllByLabelText(/Vehicle No/i)[0], { target: { value: "MP04GA7739" } });
    fireEvent.change(screen.getAllByLabelText(/Party/i)[0], { target: { value: "Swastik Habitats" } });
    fireEvent.change(screen.getAllByLabelText(/Product/i)[0], { target: { value: "Fly Ash Bricks" } });
    fireEvent.change(screen.getByLabelText(/Quantity/i), { target: { value: "4000" } });
    fireEvent.change(screen.getByLabelText(/Unit Price/i), { target: { value: "5.5" } });

    // Now Save & Print should be enabled
    expect(saveAndPrintBtn).toBeEnabled();
  });

  it("allows typing and focusing on Vehicle No, Party, Product, and Destination autocomplete fields", () => {
    renderWithProviders(<EntryFormModal opened={true} onClose={vi.fn()} />);

    const vehicleInput = screen.getAllByLabelText(/Vehicle No/i)[0];
    const partyInput = screen.getAllByLabelText(/Party/i)[0];
    const productInput = screen.getAllByLabelText(/Product/i)[0];
    const destinationInput = screen.getAllByLabelText(/Destination/i)[0];

    fireEvent.focus(vehicleInput);
    fireEvent.change(vehicleInput, { target: { value: "DL 01 AB 1234" } });
    expect(vehicleInput).toHaveValue("DL 01 AB 1234");

    fireEvent.focus(partyInput);
    fireEvent.change(partyInput, { target: { value: "Apex Construction" } });
    expect(partyInput).toHaveValue("Apex Construction");

    fireEvent.focus(productInput);
    fireEvent.change(productInput, { target: { value: "Cement Grade 53" } });
    expect(productInput).toHaveValue("Cement Grade 53");

    fireEvent.focus(destinationInput);
    fireEvent.change(destinationInput, { target: { value: "Noida Sector 62" } });
    expect(destinationInput).toHaveValue("Noida Sector 62");
  });
});

