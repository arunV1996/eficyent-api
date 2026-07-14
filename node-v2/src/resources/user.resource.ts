import { Request } from "express";
import { findValueByKey, getStateName } from "../helpers/lookup.helper";
import User from "../models/user.model";
import UserDocument from "../models/user_document.model";
import UserInformation from "../models/user_information.model";
import { temporaryUrl } from "../services/s3.service";
import {
    genderFormatted,
    onboardingLabel,
    roleLabel,
    toDateOnlyString,
    tourLabel,
    verificationLabel,
    yesNo,
} from "../utils/common.utils";
import {
    LOOKUP_TYPE_BUSINESS_TYPES,
    LOOKUP_TYPE_ID_TYPE,
    LOOKUP_TYPE_PROFESSIONS,
    LOOKUP_TYPE_SOURCES_OF_INCOMES,
    USER_TYPE_BUSINESS,
} from "../utils/constants";

/**
 * Serializes a User Sequelize instance for the API response.
 *
 * The output shape matches the legacy /node LoginController response
 * exactly so existing frontend and white-label consumers see no change.
 */
export const userToJSON = (
    user: User,
    _req: Request,
    accessToken?: string,
): Record<string, unknown> => {
    const response: Record<string, unknown> = {
        unique_id: user.uniqueId,
        email: user.email,
        mobile_country_code: user.mobileCountryCode ?? "",
        mobile: user.mobile ?? "",
        email_status: user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED",
        user_type:
            Number(user.userType) === USER_TYPE_BUSINESS
                ? "BUSINESS"
                : "PERSONAL",
        is_tfa_setup_completed: user.isTfaSetupCompleted ? "YES" : "NO",
        is_tfa_enabled: user.isTfaEnabled ? "YES" : "NO",
    };

    if (accessToken) {
        response.access_token = accessToken;
    }

    return response;
};

/**
 * Serializes one uploaded KYC document, replacing stored S3 keys with
 * signed read URLs. Falls back to the raw stored value when signing
 * fails (mirror of userShaper.shapeDocument).
 */
export const documentToJSON = async (
    document: UserDocument,
): Promise<Record<string, unknown>> => {
    let signedFile = document.documentFile ?? "";
    let signedBackFile = document.documentBackFile ?? "";

    try {
        if (document.documentFile) {
            signedFile = await temporaryUrl(document.documentFile);
        }
        if (document.documentBackFile) {
            signedBackFile = await temporaryUrl(document.documentBackFile);
        }
    } catch {
        // Signing unavailable (e.g. S3 not configured locally) — return
        // the stored values unchanged, matching legacy behavior.
    }

    return {
        document_name: document.documentName ?? "",
        document_type: document.documentType ?? "",
        document_country: document.documentCountry ?? "",
        document_file: signedFile,
        document_back_file: signedBackFile,
        document_expiry_date: toDateOnlyString(document.documentExpiryDate),
    };
};

/**
 * Formats the business_persons JSON array, resolving id_type lookup
 * keys and state codes to display values (mirror of
 * userShaper.formatBusinessPersons).
 */
const formatBusinessPersons = async (
    businessPersons: unknown,
): Promise<unknown[]> => {
    if (!Array.isArray(businessPersons)) {
        return [];
    }

    return Promise.all(
        businessPersons.map(async (person) => {
            if (person && typeof person === "object") {
                const personRecord = person as Record<string, unknown>;
                const idTypeFormatted = personRecord.id_type
                    ? await findValueByKey(
                          String(personRecord.id_type),
                          LOOKUP_TYPE_ID_TYPE,
                      )
                    : "";
                const stateFormatted = personRecord.state
                    ? await getStateName(
                          String(personRecord.state),
                          personRecord.country
                              ? String(personRecord.country)
                              : null,
                      )
                    : "";
                return {
                    ...personRecord,
                    id_type: idTypeFormatted || String(personRecord.id_type || ""),
                    state: stateFormatted || String(personRecord.state || ""),
                };
            }
            return person;
        }),
    );
};

/**
 * Builds the business_information / user_information block of the
 * profile payload (mirror of userShaper.shapeUserInfo).
 */
export const userInformationToJSON = async (
    user: User,
    information: UserInformation | null,
): Promise<{ business_information?: unknown; user_information?: unknown }> => {
    if (Number(user.userType) === USER_TYPE_BUSINESS) {
        const typeOfBusinessFormatted = information?.typeOfBusiness
            ? await findValueByKey(
                  information.typeOfBusiness,
                  LOOKUP_TYPE_BUSINESS_TYPES,
              )
            : "";
        const stateFormatted = information?.state
            ? await getStateName(information.state, information.country)
            : "";

        return {
            business_information: {
                legal_name: information?.legalName ?? "",
                country_of_incorporation:
                    information?.countryOfIncorporation ?? "",
                formation_date: toDateOnlyString(information?.formationDate),
                business_name: information?.businessName ?? "",
                address_line_1: information?.address1 ?? "",
                address_line_2: information?.address2 ?? "",
                city: information?.city ?? "",
                state: stateFormatted,
                country: information?.country ?? "",
                postal_code: information?.postalCode ?? "",
                purpose_of_transactions:
                    information?.purposeOfTransactions ?? "",
                tax_id: information?.taxId ?? "",
                website: information?.website ?? "",
                business_persons: await formatBusinessPersons(
                    information?.businessPersons,
                ),
                type_of_business: typeOfBusinessFormatted,
            },
        };
    }

    const stateFormatted = information?.state
        ? await getStateName(information.state, information.country)
        : "";
    const professionFormatted = information?.profession
        ? await findValueByKey(information.profession, LOOKUP_TYPE_PROFESSIONS)
        : "";
    const sourceOfIncomeFormatted = information?.sourceOfIncome
        ? await findValueByKey(
              information.sourceOfIncome,
              LOOKUP_TYPE_SOURCES_OF_INCOMES,
          )
        : "";
    const idTypeFormatted = information?.idType
        ? await findValueByKey(information.idType, LOOKUP_TYPE_ID_TYPE)
        : "";

    return {
        user_information: {
            title: user.title ?? "",
            first_name: user.firstName ?? "",
            middle_name: user.middleName ?? "",
            last_name: user.lastName ?? "",
            dob: toDateOnlyString(user.dob),
            gender: genderFormatted(user.gender),
            address_line_1: information?.address1 ?? "",
            address_line_2: information?.address2 ?? "",
            city: information?.city ?? "",
            state: stateFormatted,
            country: information?.country ?? "",
            postal_code: information?.postalCode ?? "",
            purpose_of_transactions: information?.purposeOfTransactions ?? "",
            id_type: idTypeFormatted || (information?.idType ?? ""),
            id_number: information?.idNumber ?? "",
            profession: professionFormatted,
            source_of_income: sourceOfIncomeFormatted,
        },
    };
};

/**
 * Onboarding payload for POST /onboarding/stepTwo (mirror of
 * userShaper.shapeOnboardingUser).
 */
export const onboardingUserToJSON = async (
    user: User,
    information: UserInformation | null,
): Promise<Record<string, unknown>> => {
    const response: Record<string, unknown> = {
        unique_id: user.uniqueId,
        title: user.title,
        first_name: user.firstName,
        last_name: user.lastName,
        email: user.email,
        mobile_country_code: user.mobileCountryCode ?? "",
        mobile: user.mobile ?? "",
        email_status: user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED",
        user_type:
            Number(user.userType) === USER_TYPE_BUSINESS
                ? "BUSINESS"
                : "PERSONAL",
        dob: user.dob ? toDateOnlyString(user.dob) : null,
        onboarding_step: onboardingLabel(user.onboardingStep),
        id_verification: verificationLabel(user.idVerification),
    };

    const informationShaped = await userInformationToJSON(user, information);
    Object.assign(response, informationShaped);

    return response;
};

/**
 * Documents payload for POST /onboarding/stepThree (mirror of
 * userShaper.shapeDocumentsUser).
 */
export const documentsUserToJSON = async (
    user: User,
    documents: UserDocument[],
): Promise<Record<string, unknown>> => {
    return {
        onboarding_step: onboardingLabel(user.onboardingStep),
        documents: await Promise.all(documents.map(documentToJSON)),
    };
};

/**
 * Full profile payload for GET /api/user/profile (mirror of
 * userShaper.shapeFullUser). Field order and shape are preserved
 * exactly so the frontend sees no change.
 */
export const fullUserToJSON = async (
    user: User,
    information: UserInformation | null,
    documents: UserDocument[] = [],
    isMerchant = false,
    businessModel = "mto",
): Promise<Record<string, unknown>> => {
    const response: Record<string, unknown> = {
        unique_id: user.uniqueId,
        email: user.email,
        mobile_country_code: user.mobileCountryCode ?? "",
        mobile: user.mobile ?? "",
        email_status: user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED",
        user_type:
            Number(user.userType) === USER_TYPE_BUSINESS
                ? "BUSINESS"
                : "PERSONAL",
        onboarding_step: onboardingLabel(user.onboardingStep),
        id_verification: verificationLabel(user.idVerification),
        sender_enabled: yesNo(user.enableSender),
        is_tfa_setup_completed: yesNo(user.isTfaSetupCompleted),
        is_tfa_enabled: yesNo(user.isTfaEnabled),
        tour_status: tourLabel(user.tourStatus),
    };

    const informationShaped = await userInformationToJSON(user, information);
    Object.assign(response, informationShaped);

    response["documents"] = await Promise.all(documents.map(documentToJSON));
    response["role"] = roleLabel(user.userRole);
    response["is_merchant"] = yesNo(isMerchant);
    response["business_model"] = businessModel;

    return response;
};

/**
 * Compact user snapshot for GET /check_user_status (mirror of
 * userShaper.shapeStatusUser). Business users show their legal /
 * business name when available.
 */
export const statusUserToJSON = (
    user: User,
    isMerchant: boolean,
    information: UserInformation | null = null,
    businessModel = "mto",
): Record<string, unknown> => {
    let name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
    if (Number(user.userType) === USER_TYPE_BUSINESS && information) {
        name = information.legalName || information.businessName || name;
    }

    return {
        name,
        email_status: user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED",
        id_verification: verificationLabel(user.idVerification),
        is_merchant: yesNo(isMerchant),
        is_tfa_enabled: yesNo(user.isTfaEnabled),
        is_tfa_setup_completed: yesNo(user.isTfaSetupCompleted),
        onboarding_step: onboardingLabel(user.onboardingStep),
        role: roleLabel(user.userRole),
        sender_enabled: yesNo(user.enableSender),
        tour_status: tourLabel(user.tourStatus),
        user_type:
            Number(user.userType) === USER_TYPE_BUSINESS
                ? "BUSINESS"
                : "PERSONAL",
        business_model: businessModel.toLowerCase(),
    };
};
