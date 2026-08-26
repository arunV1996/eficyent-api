import { Op } from "sequelize";
import { findValueByKey } from "../helpers/lookup.helper";
import Sender from "../models/sender.model";
import SenderDocument from "../models/sender_document.model";
import State from "../models/state.model";
import { temporaryUrl } from "../services/s3.service";
import { formatDateHuman } from "../utils/common.utils";
import {
    LOOKUP_TYPE_ID_TYPE,
    LOOKUP_TYPE_PROFESSIONS,
} from "../utils/constants";

/**
 * Mirror of App\Http\Resources\SenderResource (via the legacy
 * senderResource.ts) — separate business/individual layouts, lookup
 * resolution for source-of-funds / id-type / designation, and signed
 * document URLs.
 */

const TYPE_MAP: Record<number, string> = {
    1: "PERSONAL",
    2: "BUSINESS",
};

const STATUS_MAP: Record<number, string> = {
    0: "PENDING",
    1: "APPROVED",
    2: "REJECTED",
    3: "EXPIRED",
    4: "DISABLED",
};

/**
 * Mirror of the legacy senderResource-local getStateName. Legacy quirk
 * preserved: the Prisma where object spreads a SECOND `OR` key when a
 * country code is supplied, which overrides the state-code match — so
 * with a country the lookup effectively matches by country alone.
 */
const resolveStateName = async (
    stateCodeOrName: string | null | undefined,
    countryCode?: string | null,
): Promise<string> => {
    if (!stateCodeOrName) {
        return "";
    }
    const trimmed = stateCodeOrName.trim();
    const where = countryCode
        ? {
              [Op.or]: [
                  { countryCode: countryCode },
                  { countryAlpha3: countryCode },
              ],
          }
        : {
              [Op.or]: [{ stateCode: trimmed }, { name: trimmed }],
          };
    const stateRow = await State.findOne({ where });
    return stateRow ? stateRow.name : trimmed;
};

const toDateOnly = (value: Date | string): string => {
    if (typeof value === "string") {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime())
            ? value
            : parsed.toISOString().slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
};

export const senderToJSON = async (
    sender: Sender,
): Promise<Record<string, unknown>> => {
    const isBusiness = sender.type === 2;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dto: any = {
        unique_id: sender.uniqueId,
        type: sender.type ? TYPE_MAP[sender.type] ?? "PERSONAL" : null,
    };

    const stateName = sender.state
        ? await resolveStateName(sender.state, sender.country)
        : "";
    const sourceOfFundsValue = sender.sourceOfFunds
        ? await findValueByKey(sender.sourceOfFunds)
        : "";
    const idTypeValue = sender.idType
        ? await findValueByKey(sender.idType, LOOKUP_TYPE_ID_TYPE)
        : "";

    const timezone = sender.user?.timezone || "Asia/Kolkata";
    const formattedCreatedAt = formatDateHuman(sender.createdAt, timezone);

    if (isBusiness) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const businessPersonsRaw = (sender.businessPersons as any[]) || [];
        const businessPersons = [];
        for (const person of businessPersonsRaw) {
            const personState = person.state
                ? await resolveStateName(person.state, person.country)
                : "";
            const personIdType = person.id_type
                ? await findValueByKey(person.id_type, LOOKUP_TYPE_ID_TYPE)
                : "";
            const personDesignation = person.designation
                ? await findValueByKey(
                      person.designation,
                      LOOKUP_TYPE_PROFESSIONS,
                  )
                : "";
            businessPersons.push({
                email: person.email || "",
                country: person.country || "",
                id_type: personIdType,
                address_1: person.address_1 || "",
                id_number: person.id_number || "",
                last_name: person.last_name || "",
                first_name: person.first_name || "",
                designation: personDesignation,
                nationality: person.nationality || "",
                state: personState,
                mobile: person.mobile || "",
                mobile_country_code: person.mobile_country_code || "",
                address_2: person.address_2 || "",
                postal_code: person.postal_code || "",
                city: person.city || "",
                ...(person.dob ? { dob: person.dob } : {}),
            });
        }

        const proofs = [];
        for (const document of (sender.documents ||
            []) as SenderDocument[]) {
            let signedFile = document.documentFile || "";
            if (document.documentFile) {
                try {
                    signedFile = await temporaryUrl(document.documentFile);
                } catch {
                    // Use the raw URL on signing failure.
                }
            }
            proofs.push({
                document_name: document.documentName,
                document_type: document.documentType,
                document_country: document.documentCountry || "",
                document_file: signedFile,
            });
        }

        Object.assign(dto, {
            email: sender.email,
            mobile_country_code: sender.mobileCountryCode,
            mobile: sender.mobile,
            address: sender.address1 || "",
            country: sender.country || "",
            nationality: sender.nationality || "",
            city: sender.city || "",
            state: stateName,
            postal_code: sender.postalCode || "",
            source_of_funds: sourceOfFundsValue,
            id_type: idTypeValue,
            id_number: sender.idNumber || "",
            id_issued_country: sender.idIssuedCountry || "",
            id_issued_date: sender.idIssuedDate || "",
            id_expiry_date: sender.idExpiryDate || "",
            profession: sender.profession || "",
            status: STATUS_MAP[sender.status] ?? "PENDING",
            created_at: formattedCreatedAt,
            business_name: sender.firstName || "",
            business_persons: businessPersons,
            proofs,
        });
    } else {
        Object.assign(dto, {
            first_name: sender.firstName || "",
            last_name: sender.lastName || "",
            middle_name: sender.middleName || "",
            email: sender.email,
            mobile_country_code: sender.mobileCountryCode,
            mobile: sender.mobile,
            address: sender.address1 || "",
            country: sender.country || "",
            nationality: sender.nationality || "",
            city: sender.city || "",
            state: stateName,
            postal_code: sender.postalCode || "",
            source_of_funds: sourceOfFundsValue,
            id_type: idTypeValue,
            id_number: sender.idNumber || "",
            id_issued_country: sender.idIssuedCountry || "",
            id_issued_date: sender.idIssuedDate || "",
            id_expiry_date: sender.idExpiryDate || "",
            profession: sender.profession || "",
            status: STATUS_MAP[sender.status] ?? "PENDING",
            created_at: formattedCreatedAt,
        });
    }

    if (sender.clientReferenceId) {
        dto.client_reference_id = sender.clientReferenceId;
    }

    if (sender.dob) {
        dto.dob = toDateOnly(sender.dob);
    }

    return dto;
};
