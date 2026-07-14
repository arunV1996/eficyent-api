import { Request, Response } from "express";
import {
    FieldDef,
    onboardingFormFields,
    onboardingFormFieldsNew,
} from "../helpers/form_fields.helper";
import {
    firstFieldError,
    validateAgainstFields,
} from "../helpers/form_fields_validator.helper";
import { settingGet } from "../helpers/setting.helper";
import User from "../models/user.model";
import UserDocument from "../models/user_document.model";
import UserInformation from "../models/user_information.model";
import {
    documentsUserToJSON,
    onboardingUserToJSON,
} from "../resources/user.resource";
import sequelize from "../config/database";
import { uploadBase64 } from "../services/s3.service";
import { generateUniqueId } from "../utils/common.utils";
import {
    IDENTITY_VERIFICATION_PENDING,
    ID_VERIFIED_BY_ADMIN,
    ONBOARDING_STEP_MAP,
    ONBOARDING_STEP_ONE,
    ONBOARDING_STEP_THREE,
    ONBOARDING_STEP_TWO,
    USER_TYPE_PERSONAL,
} from "../utils/constants";

const USER_DOCUMENT_FILE_PATH = "user_documents";

/**
 * Mirror of the legacy Api\OnboardingController.
 *
 *   GET  /onboarding/get-form-fields  dynamic field list per (user_type, step)
 *   POST /onboarding/stepTwo          persist user + user_information
 *   POST /onboarding/stepThree        persist KYC documents (S3-backed)
 */

/** Fields that belong on the users table (everything else -> user_informations). */
const USER_FIELD_KEYS = new Set([
    "first_name",
    "middle_name",
    "last_name",
    "title",
    "email",
    "mobile_country_code",
    "mobile",
    "dob",
    "gender",
    "user_type",
]);

const splitForUserVsInformation = (
    validated: Record<string, unknown>,
): { userPart: Record<string, unknown>; infoPart: Record<string, unknown> } => {
    const userPart: Record<string, unknown> = {};
    const infoPart: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(validated)) {
        if (USER_FIELD_KEYS.has(key)) {
            userPart[key] = value;
        } else {
            infoPart[key] = value;
        }
    }
    // The business form submits owners; the column is business_persons.
    if (validated.owners !== undefined) {
        infoPart.business_persons = validated.owners;
        delete infoPart.owners;
    }
    return { userPart, infoPart };
};

/**
 * Allowlisted snake_case payload keys -> UserInformation model
 * attributes. Unexpected keys never reach the database.
 */
const informationAttributesFromPayload = (
    infoPart: Record<string, unknown>,
): Record<string, unknown> => {
    const keyMap: Array<[string, string]> = [
        ["country", "country"],
        ["address_1", "address1"],
        ["address_2", "address2"],
        ["city", "city"],
        ["state", "state"],
        ["postal_code", "postalCode"],
        ["legal_name", "legalName"],
        ["tax_id", "taxId"],
        ["business_name", "businessName"],
        ["website", "website"],
        ["formation_date", "formationDate"],
        ["business_persons", "businessPersons"],
        ["id_type", "idType"],
        ["id_number", "idNumber"],
        ["business_verification_type", "businessVerificationType"],
        ["purpose_of_transactions", "purposeOfTransactions"],
        ["profession", "profession"],
        ["source_of_income", "sourceOfIncome"],
        ["type_of_business", "typeOfBusiness"],
        ["country_of_incorporation", "countryOfIncorporation"],
    ];

    const attributes: Record<string, unknown> = {};
    for (const [payloadKey, attributeName] of keyMap) {
        if (infoPart[payloadKey] !== undefined) {
            let value = infoPart[payloadKey];
            if (attributeName === "formationDate" && typeof value === "string") {
                value = new Date(value);
            }
            attributes[attributeName] = value;
        }
    }
    return attributes;
};

/** Allowlisted snake_case payload keys -> User model attributes. */
const userAttributesFromPayload = (
    userPart: Record<string, unknown>,
): Record<string, unknown> => {
    const keyMap: Record<string, string> = {
        first_name: "firstName",
        middle_name: "middleName",
        last_name: "lastName",
        title: "title",
        mobile_country_code: "mobileCountryCode",
        mobile: "mobile",
        dob: "dob",
        gender: "gender",
        user_type: "userType",
    };

    const attributes: Record<string, unknown> = {};
    for (const [payloadKey, value] of Object.entries(userPart)) {
        const attributeName = keyMap[payloadKey];
        if (!attributeName) {
            continue;
        }
        let resolvedValue: unknown = value;
        if (attributeName === "dob" && typeof value === "string") {
            resolvedValue = new Date(value);
        }
        attributes[attributeName] = resolvedValue;
    }
    return attributes;
};

/**
 * Mirror of the legacy prefillFromUser: when the user has advanced past
 * the requested step, each field's value is pre-filled from the User /
 * UserInformation rows (matched by field_key).
 */
const prefillFromUser = async (
    fields: FieldDef[],
    user: User,
): Promise<FieldDef[]> => {
    const information = await UserInformation.findOne({
        where: { userId: user.id },
    });
    const userRecord = user.get({ plain: true }) as unknown as Record<
        string,
        unknown
    >;
    const informationRecord = information
        ? (information.get({ plain: true }) as unknown as Record<
              string,
              unknown
          >)
        : null;

    return fields.map((field) => {
        const value =
            userRecord[field.field_key] ??
            informationRecord?.[field.field_key] ??
            "";
        return {
            ...field,
            field_value:
                typeof value === "string" || typeof value === "number"
                    ? value
                    : "",
        };
    });
};

const generateUserMemo = (user: User): string => {
    const name =
        Number(user.userType) === USER_TYPE_PERSONAL
            ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
            : "";
    const prefix = (name || user.email).slice(0, 3).toUpperCase();
    const suffix = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
    return `${prefix}${suffix}`;
};

/**
 * GET /api/user/onboarding/get-form-fields?type=REGISTER_USER|GET_INFORMATION|GET_DOCUMENTS
 */
export const getFormFields = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const requestedType = String(req.query.type);
        const step = ONBOARDING_STEP_MAP[requestedType];
        const countryOfIncorporation = req.query.country_of_incorporation
            ? String(req.query.country_of_incorporation)
            : undefined;

        let fields = await onboardingFormFields(req.user.userType, step);
        const layeredFields = await onboardingFormFieldsNew(
            req.user.userType,
            { type: step, country_of_incorporation: countryOfIncorporation },
        );
        const existingKeys = new Set(fields.map((field) => field.field_key));
        fields = [
            ...fields,
            ...layeredFields.filter(
                (field) => !existingKeys.has(field.field_key),
            ),
        ];

        if (
            req.user.onboardingStep > step &&
            req.user.onboardingStep !== ONBOARDING_STEP_ONE
        ) {
            fields = await prefillFromUser(fields, req.user);
        }

        return res.sendResponse({ form_fields: fields }, "OK", 200);
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/onboarding/stepTwo
 */
export const stepTwo = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        if (Number(req.user.onboardingStep) !== ONBOARDING_STEP_ONE) {
            return res.sendError(res.__("108"), 108, 400);
        }

        const fields = await onboardingFormFields(
            req.user.userType,
            ONBOARDING_STEP_TWO,
        );
        const validationResult = validateAgainstFields(
            fields,
            req.body as Record<string, unknown>,
        );
        const validationError = firstFieldError(validationResult);
        if (validationError) {
            return res.sendError(validationError, 422, 422);
        }

        const { userPart, infoPart } = splitForUserVsInformation(
            validationResult.validated,
        );

        const authenticatedUserId = req.user.id;
        const updatedUser = await sequelize.transaction(
            async (databaseTransaction) => {
                const userRow = await User.findByPk(authenticatedUserId, {
                    transaction: databaseTransaction,
                });
                if (!userRow) {
                    throw new Error("User row disappeared mid-transaction");
                }

                await userRow.update(
                    {
                        ...userAttributesFromPayload(userPart),
                        onboardingStep: ONBOARDING_STEP_TWO,
                    },
                    { transaction: databaseTransaction },
                );

                const informationAttributes =
                    informationAttributesFromPayload(infoPart);

                const existingInformation = await UserInformation.findOne({
                    where: { userId: userRow.id },
                    transaction: databaseTransaction,
                });

                if (existingInformation) {
                    await existingInformation.update(informationAttributes, {
                        transaction: databaseTransaction,
                    });
                } else {
                    await UserInformation.create(
                        {
                            uniqueId: generateUniqueId(24),
                            userId: userRow.id,
                            ...informationAttributes,
                        } as never,
                        { transaction: databaseTransaction },
                    );
                }

                return userRow;
            },
        );

        const information = await UserInformation.findOne({
            where: { userId: updatedUser.id },
        });

        return res.sendResponse(
            { user: await onboardingUserToJSON(updatedUser, information) },
            res.__("s106"),
            106,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/onboarding/stepThree
 */
export const stepThree = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        if (Number(req.user.onboardingStep) !== ONBOARDING_STEP_TWO) {
            return res.sendError(res.__("108"), 108, 400);
        }

        const fields = await onboardingFormFields(
            req.user.userType,
            ONBOARDING_STEP_THREE,
        );
        const validationResult = validateAgainstFields(
            fields,
            req.body as Record<string, unknown>,
        );
        const validationError = firstFieldError(validationResult);
        if (validationError) {
            return res.sendError(validationError, 422, 422);
        }

        interface DocumentEntry {
            document_file?: string;
            document_back_file?: string;
            document_type?: string;
            document_country?: string;
            document_expiry_date?: string;
        }

        // Upload files outside the DB transaction (S3 calls are slow and
        // must not hold the transaction open), then persist rows inside it.
        const pendingUploads: Array<{
            documentName: string;
            attributes: Record<string, unknown>;
        }> = [];
        for (const [documentName, rawEntry] of Object.entries(
            validationResult.validated,
        )) {
            if (
                !rawEntry ||
                typeof rawEntry !== "object" ||
                Array.isArray(rawEntry)
            ) {
                continue;
            }
            const documentEntry = rawEntry as DocumentEntry;
            const attributes: Record<string, unknown> = {
                status: IDENTITY_VERIFICATION_PENDING,
            };

            if (documentEntry.document_file) {
                attributes.documentFile = documentEntry.document_file.startsWith(
                    "data:",
                )
                    ? await uploadBase64(
                          documentEntry.document_file,
                          USER_DOCUMENT_FILE_PATH,
                      )
                    : documentEntry.document_file;
                if (!attributes.documentFile) {
                    return res.sendError(res.__("109"), 109, 400);
                }
            }
            if (documentEntry.document_back_file) {
                attributes.documentBackFile =
                    documentEntry.document_back_file.startsWith("data:")
                        ? await uploadBase64(
                              documentEntry.document_back_file,
                              USER_DOCUMENT_FILE_PATH,
                          )
                        : documentEntry.document_back_file;
                if (!attributes.documentBackFile) {
                    return res.sendError(res.__("109"), 109, 400);
                }
            }
            if (documentEntry.document_type) {
                attributes.documentType = documentEntry.document_type;
            }
            if (documentEntry.document_country) {
                attributes.documentCountry = documentEntry.document_country;
            }
            if (documentEntry.document_expiry_date) {
                const expiryDate = new Date(
                    documentEntry.document_expiry_date,
                );
                if (!Number.isNaN(expiryDate.getTime())) {
                    attributes.documentExpiryDate = expiryDate;
                }
            }
            pendingUploads.push({ documentName, attributes });
        }

        const authenticatedUserId = req.user.id;
        const authenticatedUserMemo = req.user.memo;
        const documents: UserDocument[] = [];
        const resultUser = await sequelize.transaction(
            async (databaseTransaction) => {
                for (const pendingUpload of pendingUploads) {
                    const existingDocument = await UserDocument.findOne({
                        where: {
                            userId: authenticatedUserId,
                            documentName: pendingUpload.documentName,
                        },
                        transaction: databaseTransaction,
                    });
                    const documentRow = existingDocument
                        ? await existingDocument.update(
                              pendingUpload.attributes,
                              { transaction: databaseTransaction },
                          )
                        : await UserDocument.create(
                              {
                                  uniqueId: generateUniqueId(24),
                                  userId: authenticatedUserId,
                                  documentName: pendingUpload.documentName,
                                  ...pendingUpload.attributes,
                              } as never,
                              { transaction: databaseTransaction },
                          );
                    documents.push(documentRow);
                }

                const userRow = await User.findByPk(authenticatedUserId, {
                    transaction: databaseTransaction,
                });
                if (!userRow) {
                    throw new Error("User row disappeared mid-transaction");
                }
                await userRow.update(
                    {
                        onboardingStep: ONBOARDING_STEP_THREE,
                        memo: authenticatedUserMemo ?? generateUserMemo(req.user!),
                    },
                    { transaction: databaseTransaction },
                );
                return userRow;
            },
        );

        const responseData: Record<string, unknown> = {
            user: await documentsUserToJSON(resultUser, documents),
        };

        // KYC handoff for individuals. id_verification_url stays null
        // until the external KYC provider drivers (legacy kycFactory)
        // are migrated to node-v2 services — integrate the driver call
        // here at that point. Null matches the legacy behavior when the
        // provider call fails.
        if (Number(resultUser.userType) === USER_TYPE_PERSONAL) {
            const kycService = await settingGet<string>("kyc_service", "");
            if (kycService && kycService !== ID_VERIFIED_BY_ADMIN) {
                responseData.id_verification_url = null;
            }
        }

        return res.sendResponse(responseData, res.__("s106"), 106);
    } catch (error) {
        return res.handleError(error);
    }
};
