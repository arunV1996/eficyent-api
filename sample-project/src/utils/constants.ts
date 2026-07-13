// Transaction Types
export const TRANSACTION_TYPE_DEPOSIT = "deposit";
export const TRANSACTION_TYPE_WITHDRAWAL = "withdrawal";
export const TRANSACTION_TYPE_TRANSFER = "transfer";
export const TRANSACTION_TYPE_TRADE = "trade";

export const TRANSACTION_TYPES = [
    TRANSACTION_TYPE_DEPOSIT,
    TRANSACTION_TYPE_WITHDRAWAL,
    TRANSACTION_TYPE_TRANSFER,
    TRANSACTION_TYPE_TRADE,
] as const;

// Transaction Statuses
export const TRANSACTION_STATUS_PENDING = "pending";
export const TRANSACTION_STATUS_PROCESSING = "processing";
export const TRANSACTION_STATUS_COMPLETED = "completed";
export const TRANSACTION_STATUS_FAILED = "failed";
export const TRANSACTION_STATUS_CANCELLED = "cancelled";

export const TRANSACTION_STATUSES = [
    TRANSACTION_STATUS_PENDING,
    TRANSACTION_STATUS_PROCESSING,
    TRANSACTION_STATUS_COMPLETED,
    TRANSACTION_STATUS_FAILED,
    TRANSACTION_STATUS_CANCELLED,
] as const;

// Currency Types
export const CURRENCY_TYPE_FIAT = "fiat";
export const CURRENCY_TYPE_CRYPTO = "crypto";

export const CURRENCY_TYPES = [
    CURRENCY_TYPE_FIAT,
    CURRENCY_TYPE_CRYPTO,
] as const;

// Currency Statuses
export const CURRENCY_STATUS_ACTIVE = "active";
export const CURRENCY_STATUS_INACTIVE = "inactive";

export const CURRENCY_STATUSES = [
    CURRENCY_STATUS_ACTIVE,
    CURRENCY_STATUS_INACTIVE,
] as const;
