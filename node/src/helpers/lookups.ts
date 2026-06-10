/**
 * Mirror of Laravel ViewHelper.php / Enums.php functions used by Phase 2
 * controllers. Names preserved (snake_case) to ease cross-codebase grep.
 */
import { prisma } from "../db/prisma";

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

const ALPHA3_TO_ALPHA2: Record<string, string> = {
  "ALB": "al", "DZA": "dz", "AND": "ad", "AGO": "ao", "ATA": "aq", "ARG": "ar", "ARM": "am", "ABW": "aw",
  "AUS": "au", "AUT": "at", "AZE": "az", "BHR": "bh", "BGD": "bd", "BEL": "be", "BLZ": "bz", "BEN": "bj",
  "BTN": "bt", "BOL": "bo", "BIH": "ba", "BWA": "bw", "BRA": "br", "BRN": "bn", "BGR": "bg", "BFA": "bf",
  "MMR": "mm", "BDI": "bi", "KHM": "kh", "CMR": "cm", "CAN": "ca", "CPV": "cv", "TCD": "td", "CHL": "cl",
  "CXR": "cx", "CCK": "cc", "COL": "co", "COM": "km", "COG": "cd", "COK": "ck", "CRI": "cr", "CIV": "ci",
  "HRV": "hr", "CYP": "cy", "CZE": "cz", "DNK": "dk", "DJI": "dj", "ECU": "ec", "EGY": "eg", "SLV": "sv",
  "GNQ": "gq", "ERI": "er", "EST": "ee", "FLK": "fk", "FRO": "fo", "FJI": "fj", "FIN": "fi", "FRA": "fr",
  "PYF": "pf", "GAB": "ga", "GMB": "gm", "GEO": "ge", "DEU": "de", "GHA": "gh", "GIB": "gi", "GRC": "gr",
  "GRL": "gl", "GTM": "gt", "GIN": "gn", "GNB": "gw", "GUY": "gy", "HTI": "ht", "VAT": "va", "HND": "hn",
  "HKG": "hk", "HUN": "hu", "ISL": "is", "IND": "in", "IDN": "id", "IRL": "ie", "ISR": "il", "ITA": "it",
  "JPN": "jp", "JOR": "jo", "KAZ": "kz", "KEN": "ke", "KIR": "ki", "KOR": "kr", "XKX": "un", "KWT": "kw",
  "KGZ": "kg", "LAO": "la", "LVA": "lv", "LBN": "lb", "LSO": "ls", "LBR": "lr", "LIE": "li", "LTU": "lt",
  "LUX": "lu", "MAC": "mo", "MKD": "mk", "MDG": "mg", "MWI": "mw", "MYS": "my", "MDV": "mv", "MLT": "mt",
  "MHL": "mh", "MRT": "mr", "MUS": "mu", "MYT": "yt", "MEX": "mx", "FSM": "fm", "MDA": "md", "MCO": "mc",
  "MNG": "mn", "MNE": "me", "MAR": "ma", "MOZ": "mz", "NAM": "na", "NRU": "nr", "NPL": "np", "NLD": "nl",
  "ANT": "an", "NCL": "nc", "NZL": "nz", "NER": "ne", "NGA": "ng", "NIU": "nu", "NOR": "no", "OMN": "om",
  "PAK": "pk", "PLW": "pw", "PSE": "ps", "PAN": "pa", "PNG": "pg", "PRY": "py", "PER": "pe", "PHL": "ph",
  "PCN": "pn", "POL": "pl", "PRT": "pt", "QAT": "qa", "REU": "re", "ROU": "ro", "RUS": "ru", "RWA": "rw",
  "BLM": "bl", "MAF": "mf", "WSM": "ws", "SMR": "sm", "STP": "st", "SAU": "sa", "SEN": "sn", "SRB": "rs",
  "SYC": "sc", "SLE": "sl", "SGP": "sg", "SVK": "sk", "SVN": "si", "SLB": "sb", "ZAF": "za", "ESP": "es",
  "LKA": "lk", "SHN": "sh", "SUR": "sr", "SJM": "sj", "SWZ": "sz", "SWE": "se", "CHE": "ch", "TWN": "tw",
  "TJK": "tj", "TZA": "tz", "THA": "th", "TLS": "tl", "TGO": "tg", "TKL": "tk", "TON": "to", "TUN": "tn",
  "TUR": "tr", "TKM": "tm", "TUV": "tv", "UGA": "ug", "UKR": "ua", "ARE": "ae", "GBR": "gb", "USA": "us",
  "URY": "uy", "UZB": "uz", "VUT": "vu", "VEN": "yv", "VNM": "vn", "WLF": "wf", "ESH": "eh", "YEM": "ye",
  "ZMB": "zm", "ZWE": "zw", "CHN": "cn"
};

/**
 * Mirror of get_flag(). The Laravel asset() helper served `images/countries/<cc>.png`
 * out of the public/ folder. In Node we expose flags via static asset CDN
 * (configurable via APP_URL).
 */
export function getFlagUrl(code: string | null | undefined, baseUrl: string): string {
  if (!code) return "";
  const key = code.toUpperCase();
  const alpha2 = ALPHA3_TO_ALPHA2[key] || code.toLowerCase();
  return `${baseUrl.replace(/\/$/, "")}/images/countries/${alpha2}.png`;
}

/**
 * Mirror of format_date_human(). Expected: "26 Nov 2025 03:41 PM"
 */
export function formatDate(date: Date | null | undefined, timezone = "Asia/Kolkata"): string {
  if (!date) return "";
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    for (const part of parts) {
      partMap[part.type] = part.value;
    }
    const d = String(partMap.day).padStart(2, "0");
    const m = partMap.month;
    const y = partMap.year;
    const h = String(partMap.hour).padStart(2, "0");
    const min = String(partMap.minute).padStart(2, "0");
    const ampm = partMap.dayPeriod ?? "";
    return `${d} ${m} ${y} ${h}:${min} ${ampm}`;
  } catch (err) {
    // Fallback if timezone is invalid
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = date.getDate();
    const m = months[date.getMonth()];
    const y = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const h = String(hours).padStart(2, "0");
    return `${String(d).padStart(2, "0")} ${m} ${y} ${h}:${minutes} ${ampm}`;
  }
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

let lookupsCache: Record<string, string> = {};
let isLookupsLoaded = false;

export async function preloadLookups(): Promise<void> {
  if (isLookupsLoaded) return;
  try {
    const lookups = await prisma().lookup.findMany({
      select: { key: true, value: true },
    });
    for (const item of lookups) {
      lookupsCache[item.key] = item.value;
    }
    isLookupsLoaded = true;
  } catch (err) {
    console.error("Failed to preload lookups", err);
  }
}

export function findValueByKeySync(key: string | number | null | undefined): string {
  if (key === null || key === undefined) return "";
  const strKey = String(key);
  return lookupsCache[strKey] ?? strKey;
}

