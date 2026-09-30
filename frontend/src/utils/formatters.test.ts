import { describe, it, expect } from "vitest";
import { formatIndianCurrency, formatDate, amountInWordsIndian } from "./formatters";

describe("formatIndianCurrency", () => {
  it("formats zero and empty values as Rs. 0.00", () => {
    expect(formatIndianCurrency(0)).toBe("Rs. 0.00");
    expect(formatIndianCurrency(null)).toBe("Rs. 0.00");
    expect(formatIndianCurrency(undefined)).toBe("Rs. 0.00");
    expect(formatIndianCurrency("")).toBe("Rs. 0.00");
  });

  it("formats standard amounts with two decimal places", () => {
    expect(formatIndianCurrency(500)).toBe("Rs. 500.00");
    expect(formatIndianCurrency(1250.5)).toBe("Rs. 1,250.50");
  });

  it("formats lakh and crore groupings properly in Indian numbering system", () => {
    // 1 Lakh = 1,00,000.00
    expect(formatIndianCurrency(100000)).toBe("Rs. 1,00,000.00");
    // 1.25 Lakh = 1,25,000.00
    expect(formatIndianCurrency(125000)).toBe("Rs. 1,25,000.00");
    // 1 Crore = 1,00,00,000.00
    expect(formatIndianCurrency(10000000)).toBe("Rs. 1,00,00,000.00");
  });

  it("handles string numeric inputs gracefully", () => {
    expect(formatIndianCurrency("245000.75")).toBe("Rs. 2,45,000.75");
    expect(formatIndianCurrency("invalid")).toBe("Rs. 0.00");
  });
});

describe("formatDate", () => {
  it("formats valid ISO dates into DD/MM/YYYY", () => {
    expect(formatDate("2026-09-29T10:30:00Z")).toBe("29/09/2026");
    expect(formatDate("2026-01-05T00:00:00.000Z")).toBe("05/01/2026");
  });

  it("returns '-' for empty or invalid date strings", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate(undefined)).toBe("-");
    expect(formatDate("")).toBe("-");
    expect(formatDate("not-a-date")).toBe("-");
  });
});

describe("amountInWordsIndian", () => {
  it("converts 0 and empty values to Zero Rupees Only", () => {
    expect(amountInWordsIndian(0)).toBe("Zero Rupees Only");
    expect(amountInWordsIndian(null)).toBe("Zero Rupees Only");
    expect(amountInWordsIndian("")).toBe("Zero Rupees Only");
  });

  it("converts numbers to Indian Rupees in words", () => {
    expect(amountInWordsIndian(24640)).toBe("Twenty Four Thousand Six Hundred Forty Rupees Only");
    expect(amountInWordsIndian(125000)).toBe("One Lakh Twenty Five Thousand Rupees Only");
    expect(amountInWordsIndian(5.5)).toBe("Five Rupees and Fifty Paise Only");
  });
});
