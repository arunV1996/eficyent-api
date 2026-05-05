import {
  BENEFICIARY_TRANSACTION_COMPLETED,
  BENEFICIARY_TRANSACTION_FAILED,
  BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
  BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
  DEPOSIT_TRANSACTION_COMPLETED,
  DEPOSIT_TRANSACTION_FAILED,
  DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
  DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
  EXTERNAL_TYPE_CALIZA,
  EXTERNAL_TYPE_DIGININE,
  EXTERNAL_TYPE_VIYONA_PAY,
} from "../../helpers/constants";
import { logger } from "../../helpers/logger";

/**
 * Mirror of App\\Helpers\\ViewHelper::ProcessingUnit_status_map.
 *
 * Maps the upstream ProcessingUnit string status onto the canonical
 * BeneficiaryTransaction integer status. Unknown statuses are logged and
 * defaulted to PROCESSING_UNIT_PROCESSING so the row stays visible to ops
 * dashboards instead of silently freezing.
 */
export interface PuStatusResult {
  mapped: number;
  isNew: boolean;
  original: string;
}

const WITHDRAW_MAP: Record<string, number> = {
  PENDING: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
  INPROGRESS: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
  SUCCESS: BENEFICIARY_TRANSACTION_COMPLETED,
  PARTIALLY_FAILED: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
  FAILED: BENEFICIARY_TRANSACTION_FAILED,
  REJECTED: BENEFICIARY_TRANSACTION_FAILED,
};

const DEPOSIT_MAP: Record<string, number> = {
  PENDING: DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
  INPROGRESS: DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
  SUCCESS: DEPOSIT_TRANSACTION_COMPLETED,
  FAILED: DEPOSIT_TRANSACTION_FAILED,
};

export function mapProcessingUnitWithdrawStatus(status: string): PuStatusResult {
  const mapped = WITHDRAW_MAP[status];
  if (mapped === undefined) {
    logger.warn(
      { type: "PROCESSING_UNIT_STATUS", value: status },
      "New Processing Unit Status received",
    );
    return {
      mapped: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
      isNew: true,
      original: status,
    };
  }
  return { mapped, isNew: false, original: status };
}

export function mapProcessingUnitDepositStatus(status: string): PuStatusResult {
  const mapped = DEPOSIT_MAP[status];
  if (mapped === undefined) {
    logger.warn(
      { type: "PROCESSING_UNIT_DEPOSIT_STATUS", value: status },
      "New Processing Unit deposit status received",
    );
    return {
      mapped: DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
      isNew: true,
      original: status,
    };
  }
  return { mapped, isNew: false, original: status };
}

/**
 * Mirror of App\\Helpers\\ViewHelper::ProcessingUnitServiceMap. Maps the
 * upstream service-tag (ED/ECZ/EVP/MANUAL) back to the canonical
 * external_type code.
 */
const SERVICE_TO_EXTERNAL_TYPE: Record<string, string> = {
  ED: EXTERNAL_TYPE_DIGININE,
  ECZ: EXTERNAL_TYPE_CALIZA,
  EVP: EXTERNAL_TYPE_VIYONA_PAY,
  MANUAL: "em",
};

export function mapProcessingUnitServiceToExternalType(service: string): string {
  return SERVICE_TO_EXTERNAL_TYPE[service] ?? service;
}
