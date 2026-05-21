/**
 * Mirror of Laravel ViewHelper.php / Enums.php functions used by Phase 2
 * controllers. Names preserved (snake_case) to ease cross-codebase grep.
 */

/**
 * Same regex as Laravel passwordRegex():
 *   /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&._\-])[A-Za-z\d@$!%*?&._\-]{8,}$/
 */
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&._\-])[A-Za-z\d@$!%*?&._\-]{8,}$/;

/**
 * Mirror of disposable_email_list().
 */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "maildrop.cc",
  "dropmail.me",
  "harakirimail.com",
  "trashmail.com",
  "yopmail.com",
  "fakeinbox.com",
  "throwawaymail.com",
  "getnada.com",
  "tempinbox.com",
  "tempmailo.com",
  "moakt.com",
  "mailnesia.com",
  "spamgourmet.com",
  "sharklasers.com",
]);

export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(email.slice(at + 1).toLowerCase());
}

/**
 * Mirror of user_type_map(): receiving-country recipient_type translation.
 *   PERSONAL -> USER_TYPE_INDIVIDUAL (1)
 *   BUSINESS -> USER_TYPE_BUSINESS   (2)
 */
export const USER_TYPE_MAP: Record<string, number> = {
  PERSONAL: 1,
  BUSINESS: 2,
};

/**
 * Mirror of generateEmailCodeExpiry(): Laravel returned a unix timestamp
 * (string serialized). We keep the same semantics so legacy DB rows remain
 * compatible: store an ISO date string at +N minutes from now.
 */
export function generateEmailCodeExpiry(minutesAhead = 10): string {
  return new Date(Date.now() + minutesAhead * 60_000).toISOString();
}

/**
 * Mirror of get_payment_rails().
 */
export function getPaymentRails(): { label: string; value: string }[] {
  return [
    { label: "Wire", value: "wire" },
    { label: "ACH", value: "ach" },
    { label: "Swift", value: "swift" },
  ];
}

/**
 * Mirror of get_account_types().
 */
export function getAccountTypes(): { label: string; value: string }[] {
  return [
    { label: "Checking", value: "Checking" },
    { label: "Savings", value: "Savings" },
    { label: "General Ledger", value: "GeneralLedger" },
    { label: "Loan", value: "Loan" },
  ];
}

/**
 * Mirror of deposit_source_of_fund() and deposit_purpose() static maps.
 * Used by /user/lookups/deposit_lookups.
 */
export const DEPOSIT_SOURCE_OF_FUNDS: Record<string, string> = {
  employment_income: "Employment Income",
  personal_savings: "Personal Savings",
  business_revenue: "Business Revenue",
  sales_commission: "Sales Commission",
  borrowed_funds: "Borrowed Funds",
  investment_returns: "Investment Returns",
  legal_settlement: "Legal Settlement Proceeds",
  prize_earnings: "Prize or Lottery Earnings",
  goods_sales: "Merchandise Sales",
  property_sale: "Property Disposal",
  dividend_income: "Dividend Earnings",
  pension_income: "Retirement Pension",
  freelance_income: "Freelance Earnings",
  gift_received: "Family Support / Gift",
  other_income: "Other Income Source",
};

export const DEPOSIT_PURPOSE: Record<string, string> = {
  incentive_payment: "Incentive Payment",
  internal_transfer: "Internal Fund Transfer",
  card_settlement: "Card Settlement Processing",
  credit_card_bill: "Credit Card Bill Payment",
  trade_settlement: "Commercial Trade Settlement",
  consulting_services: "Technology or Consulting Services",
  license_fee: "Intellectual Property / License Fee",
  trade_refund: "Trade Refund or Adjustment",
  tax_payment: "Government Tax Payment",
  invoice_payment: "Invoice Settlement",
  loan_repayment: "Debt Repayment",
  payroll_payment: "Payroll Disbursement",
  supplier_payment: "Vendor or Supplier Payment",
  investment_funding: "Investment Funding",
  personal_transfer: "Personal Fund Transfer",
  product_purchase: "Purchase of Products",
  service_payment: "Professional Service Charges",
  other_payment: "Miscellaneous Payment",
};

/**
 * Mirror of generate_random_string(). The original was sha1(time . rand()).
 * For backup-code-grade randomness we use 10 unique 6-digit codes.
 */
export function generateBackupCodes(): string {
  const codes = new Set<string>();
  while (codes.size < 10) {
    codes.add(String(100_000 + Math.floor(Math.random() * 900_000)));
  }
  return Array.from(codes).join(",");
}

/**
 * Mirror of get_flag(). The Laravel asset() helper served `images/countries/<cc>.png`
 * out of the public/ folder. In Node we expose flags via static asset CDN
 * (configurable via APP_URL).
 */
export function getFlagUrl(alpha2: string | null | undefined, baseUrl: string): string {
  if (!alpha2) return "";
  return `${baseUrl.replace(/\/$/, "")}/images/countries/${alpha2.toLowerCase()}.png`;
}

/**
 * Mirror of format_date_human(). Expected: "26 Nov 2025 03:41 PM"
 */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = date.getDate();
  const m = months[date.getMonth()];
  const y = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const h = String(hours).padStart(2, "0");
  return `${String(d).padStart(2, "0")} ${m} ${y} ${h}:${minutes} ${ampm}`;
}
export function format_processing_unit_fx_rate(fxRate: string | number | null | undefined): string | number {
  if (!fxRate) return "";
  if (typeof fxRate === "string" && fxRate.includes("=")) {
    const parts = fxRate.split("=");
    if (parts[1]) {
      return parts[1].trim().replace(/[^\d.]/g, "");
    }
  }
  return fxRate;
}
