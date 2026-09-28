/**
 * Formats a number or string into Indian currency notation:
 * E.g., 125000.5 -> "Rs. 1,25,000.50"
 */
export function formatIndianCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") {
    return "Rs. 0.00";
  }

  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) {
    return "Rs. 0.00";
  }

  const formattedNumber = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);

  return `Rs. ${formattedNumber}`;
}

/**
 * Formats an ISO datetime string into Indian DD/MM/YYYY representation.
 */
export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "-";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "-";
  }
}
