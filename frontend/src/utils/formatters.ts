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

/**
 * Converts an amount in Indian Rupees to words (e.g. 24640 -> "Twenty Four Thousand Six Hundred Forty Rupees Only").
 */
export function amountInWordsIndian(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "Zero Rupees Only";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num) || num === 0) return "Zero Rupees Only";

  const singleDigits = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertBelowThousand(n: number): string {
    let str = "";
    if (n >= 100) {
      str += singleDigits[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + " ";
      n %= 10;
    } else if (n >= 10) {
      str += teens[n - 10] + " ";
      n = 0;
    }
    if (n > 0) {
      str += singleDigits[n] + " ";
    }
    return str.trim();
  }

  const [rupeesPart, paisePart] = Math.abs(num).toFixed(2).split(".");
  let rupees = parseInt(rupeesPart, 10);
  const paise = parseInt(paisePart, 10);

  let words = "";

  const crore = Math.floor(rupees / 10000000);
  rupees %= 10000000;

  const lakh = Math.floor(rupees / 100000);
  rupees %= 100000;

  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;

  const remainder = rupees;

  if (crore > 0) {
    words += convertBelowThousand(crore) + " Crore ";
  }
  if (lakh > 0) {
    words += convertBelowThousand(lakh) + " Lakh ";
  }
  if (thousand > 0) {
    words += convertBelowThousand(thousand) + " Thousand ";
  }
  if (remainder > 0) {
    words += convertBelowThousand(remainder) + " ";
  }

  words = words.trim();
  if (!words) {
    words = "Zero";
  }

  let result = `${words} Rupees`;
  if (paise > 0) {
    result += ` and ${convertBelowThousand(paise)} Paise`;
  }
  result += " Only";
  return result;
}
