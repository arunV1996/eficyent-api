import { Request, Response } from "express";
import { Op, WhereOptions } from "sequelize";
import sequelize from "../config/database";
import {
    NormalizedBeneficiaryPayload,
    validateAndNormalizeBeneficiary,
} from "../helpers/beneficiary_normalizer.helper";
import {
    beneficiaryFormFields,
    FormFieldsError,
} from "../helpers/form_fields.helper";
import BeneficiaryAccount from "../models/beneficiary_account.model";
import BeneficiaryAccountValidation from "../models/beneficiary_account_validation.model";
import BeneficiaryAdditionalDetail from "../models/beneficiary_additional_detail.model";
import Merchant from "../models/merchant.model";
import { beneficiaryAccountToJSON } from "../resources/beneficiary_account.resource";
import {
    flattenFormFields,
    generateBulkTemplate,
    processExcel,
} from "../services/excel_import.service";
import { validateAccount as processingUnitValidateAccount } from "../services/processing_unit.service";
import { temporaryUrl, upload } from "../services/s3.service";
import { extractUploadedFileBuffer } from "../helpers/uploaded_file.helper";
import { teamMemberContext } from "../helpers/team_context.helper";
import { passesTransactionTfa } from "../helpers/tfa.helper";
import { generateUniqueId } from "../utils/common.utils";
import {
    BENEFICIARY_ACCOUNT_ACTIVATED,
    BENEFICIARY_ACCOUNT_STATUS_MAP,
    PAYMENT_RAIL_ACH,
    PAYMENT_RAIL_SWIFT,
    PAYMENT_RAIL_WIRE,
    TAKE_COUNT,
    TEAM_MEMBER_ROLE_CORPORATE,
    USER_TYPE_MAP,
} from "../utils/constants";

/**
 * Mirror of Api\BeneficiaryAccountsController.
 *
 * Implemented: get-form-fields, list, show, store, validate_account,
 * delete.
 *
 * Deferred until their dependencies are ported to node-v2:
 *   - Team scoping: corporate-role list scoping (team_member_id filter
 *     on /list) and writing team_member_id during /store arrive with
 *     the team module.
 *   - Caliza background sync: newly created beneficiaries are synced
 *     to Caliza for users with an active "ec" user_services row in the
 *     legacy service; this fires once the Caliza provider service and
 *     user_services model are ported.
 *   - Bulk import/export: /bulk/template (Excel download) and
 *     /bulk/store (Excel import) arrive with the ExcelImportService.
 */

/**
 * GET /api/user/beneficiaries/get-form-fields?type=..&country=..&currency=..
 *
 * Dynamic payout-target form for the requested corridor. Unsupported
 * corridors respond with the legacy 422 envelope.
 */
export const getFormFields = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const requestQuery = req.query as Record<string, string | undefined>;
        const rawType = String(requestQuery.type);
        const recipientType = /^\d+$/.test(rawType)
            ? Number(rawType)
            : USER_TYPE_MAP[rawType];

        const fields = await beneficiaryFormFields({
            country: String(requestQuery.country),
            currency: String(requestQuery.currency),
            type: recipientType,
            merchantId: req.user.merchantId,
            payment_rail: requestQuery.payment_rail
                ? String(requestQuery.payment_rail)
                : null,
        });

        return res.sendResponse({ form_fields: fields }, "", 200);
    } catch (error) {
        if (error instanceof FormFieldsError) {
            return res.sendError(
                error.message,
                error.errorCode,
                error.httpStatus,
            );
        }
        return res.handleError(error);
    }
};

/**
 * GET /api/user/beneficiaries/list
 */
export const index = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const requestQuery = req.query as Record<string, string | undefined>;

        const statusFilter =
            requestQuery.status &&
            requestQuery.status in BENEFICIARY_ACCOUNT_STATUS_MAP
                ? BENEFICIARY_ACCOUNT_STATUS_MAP[requestQuery.status]
                : null;
        const typeFilter = requestQuery.type
            ? USER_TYPE_MAP[requestQuery.type]
            : null;
        const searchKey = requestQuery.search_key;

        const whereClause: WhereOptions = {
            userId: req.user.id,
            ...(typeFilter !== null && typeFilter !== undefined
                ? { type: typeFilter }
                : {}),
            ...(requestQuery.payment_rail
                ? { paymentRail: requestQuery.payment_rail }
                : {}),
            ...(statusFilter !== null ? { status: statusFilter } : {}),
            ...(requestQuery.recipient_country
                ? { country: requestQuery.recipient_country }
                : {}),
            ...(requestQuery.recipient_currency
                ? { currency: requestQuery.recipient_currency }
                : {}),
            ...(searchKey
                ? {
                      [Op.or]: [
                          { email: { [Op.substring]: searchKey } },
                          { uniqueId: { [Op.substring]: searchKey } },
                          { firstName: { [Op.substring]: searchKey } },
                          { lastName: { [Op.substring]: searchKey } },
                          { mobile: { [Op.substring]: searchKey } },
                          { accountNumber: { [Op.substring]: searchKey } },
                          { accountName: { [Op.substring]: searchKey } },
                          { bankName: { [Op.substring]: searchKey } },
                          { routingNumber: { [Op.substring]: searchKey } },
                          { swiftCode: { [Op.substring]: searchKey } },
                          { businessName: { [Op.substring]: searchKey } },
                      ],
                  }
                : {}),
        };
        const corporateContext = teamMemberContext(req);
        if (
            corporateContext &&
            corporateContext.role === TEAM_MEMBER_ROLE_CORPORATE
        ) {
            (whereClause as Record<string, unknown>).teamMemberId =
                corporateContext.id;
        }

        const skip = requestQuery.skip ? Number(requestQuery.skip) : 0;
        const take = requestQuery.take ? Number(requestQuery.take) : TAKE_COUNT;

        // paranoid:true on the model scopes out soft-deleted rows
        // automatically (mirror of the legacy deletedAt: null filter).
        const [total, accountRows] = await Promise.all([
            BeneficiaryAccount.count({ where: whereClause }),
            BeneficiaryAccount.findAll({
                where: whereClause,
                order: [["created_at", "DESC"]],
                offset: skip,
                limit: take,
                include: [
                    {
                        model: BeneficiaryAdditionalDetail,
                        as: "additionalDetails",
                    },
                ],
            }),
        ]);

        return res.sendResponse(
            {
                total,
                beneficiary_accounts: await Promise.all(
                    accountRows.map(beneficiaryAccountToJSON),
                ),
            },
            "",
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/beneficiaries/show?beneficiary_account_id=...
 */
export const show = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const beneficiaryAccountId = String(req.query.beneficiary_account_id);
        const accountRow = await BeneficiaryAccount.findOne({
            where: {
                userId: req.user.id,
                uniqueId: beneficiaryAccountId,
            },
            include: [
                {
                    model: BeneficiaryAdditionalDetail,
                    as: "additionalDetails",
                },
            ],
        });
        if (!accountRow) {
            return res.sendError(res.__("118"), 118, 400);
        }

        return res.sendResponse(
            { beneficiary_account: await beneficiaryAccountToJSON(accountRow) },
            "Beneficiary fetched successfully.",
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

const stringOrNull = (
    source: Record<string, unknown>,
    key: string,
): string | null => {
    const value = source[key];
    return typeof value === "string" && value.length > 0 ? value : null;
};

/**
 * Maps the normalizer's snake_case payload onto BeneficiaryAccount
 * model attributes (mirror of the legacy toBeneficiaryInsert).
 */
const beneficiaryAttributesFromNormalized = (
    payload: NormalizedBeneficiaryPayload["beneficiaryAccount"],
    userId: number,
): Record<string, unknown> => {
    return {
        uniqueId: generateUniqueId(24),
        userId,
        type: typeof payload.type === "number" ? payload.type : null,
        country: String(payload.country ?? "US"),
        currency: String(payload.currency ?? "USD"),
        firstName: stringOrNull(payload, "first_name"),
        middleName: stringOrNull(payload, "middle_name"),
        lastName: stringOrNull(payload, "last_name"),
        email: stringOrNull(payload, "email"),
        mobileCountryCode: stringOrNull(payload, "mobile_country_code"),
        mobile: stringOrNull(payload, "mobile"),
        paymentRail: stringOrNull(payload, "payment_rail"),
        serviceBank: stringOrNull(payload, "service_bank"),
        bankName: stringOrNull(payload, "bank_name"),
        routingNumber: stringOrNull(payload, "routing_number"),
        accountName: stringOrNull(payload, "account_name"),
        accountNumber: stringOrNull(payload, "account_number"),
        accountType: stringOrNull(payload, "account_type"),
        swiftCode: stringOrNull(payload, "swift_code"),
        iban: stringOrNull(payload, "iban"),
        intermediaryBankSwiftCode: stringOrNull(
            payload,
            "intermediary_bank_swift_code",
        ),
        intermediaryBankName: stringOrNull(payload, "intermediary_bank_name"),
        intermediaryBankAba: stringOrNull(payload, "intermediary_bank_aba"),
        intermediaryBankAddress: stringOrNull(
            payload,
            "intermediary_bank_address",
        ),
        intermediaryBankCity: stringOrNull(payload, "intermediary_bank_city"),
        intermediaryBankState: stringOrNull(payload, "intermediary_bank_state"),
        intermediaryBankPostalCode: stringOrNull(
            payload,
            "intermediary_bank_postal_code",
        ),
        intermediaryBankCountry: stringOrNull(
            payload,
            "intermediary_bank_country",
        ),
        bankCountry: stringOrNull(payload, "bank_country"),
        businessName: stringOrNull(payload, "business_name"),
        businessCountry: stringOrNull(payload, "business_country"),
        status: BENEFICIARY_ACCOUNT_ACTIVATED,
    };
};

/**
 * Maps the normalizer's additional-detail payload onto
 * BeneficiaryAdditionalDetail attributes (mirror of toAdditionalInsert).
 */
const additionalDetailAttributesFromNormalized = (
    payload: NormalizedBeneficiaryPayload["beneficiaryAccountAdditionalDetail"],
): Record<string, unknown> => {
    return {
        uniqueId: generateUniqueId(24),
        addressType: stringOrNull(payload, "address_type"),
        addressLine1: stringOrNull(payload, "address_line1"),
        addressLine2: stringOrNull(payload, "address_line2"),
        postalCode: stringOrNull(payload, "postal_code"),
        city: stringOrNull(payload, "city"),
        state: stringOrNull(payload, "state"),
        country: stringOrNull(payload, "country"),
        paymentType: stringOrNull(payload, "payment_type"),
        bankAddressLine1: stringOrNull(payload, "bank_address_line1"),
        bankAddressLine2: stringOrNull(payload, "bank_address_line2"),
        bankPostalCode: stringOrNull(payload, "bank_postal_code"),
        bankCity: stringOrNull(payload, "bank_city"),
        bankState: stringOrNull(payload, "bank_state"),
        bankCountry: stringOrNull(payload, "bank_country"),
        purposeOfTransaction: stringOrNull(payload, "purpose_of_transaction"),
        userSourceOfIncome: stringOrNull(payload, "user_source_of_income"),
    };
};

/**
 * POST /api/user/beneficiaries/store
 *
 * Validates the dynamic beneficiary form, guards against duplicate
 * (account_number, currency) pairs, and persists the account + its
 * additional-detail row in one transaction. USA/USD accounts without a
 * SWIFT code fan out into ACH + WIRE rail rows; with a SWIFT code they
 * become a single SWIFT rail row (mirror of the legacy store).
 *
 * Deferred: the Caliza createBeneficiary background sync (needs the
 * user_services model + Caliza provider service tranche).
 */
export const store = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const normalized = await validateAndNormalizeBeneficiary(
            req.body as Record<string, unknown>,
            req.user,
        );

        const accountNumber = normalized.beneficiaryAccount.account_number as
            | string
            | undefined;
        if (accountNumber) {
            const duplicateAccount = await BeneficiaryAccount.findOne({
                where: {
                    userId: req.user.id,
                    accountNumber,
                    currency: String(
                        normalized.beneficiaryAccount.currency ?? "",
                    ),
                },
            });
            if (duplicateAccount) {
                return res.sendError(res.__("158"), 158, 400);
            }
        }

        const authenticatedUserId = req.user.id;
        const createdAccounts = await sequelize.transaction(
            async (databaseTransaction) => {
                const baseAttributes = beneficiaryAttributesFromNormalized(
                    normalized.beneficiaryAccount,
                    authenticatedUserId,
                );

                // USA + USD with no SWIFT -> create both ACH and WIRE rails.
                const isUsdUsa =
                    baseAttributes.country === "USA" &&
                    baseAttributes.currency === "USD";
                const hasSwiftCode = Boolean(baseAttributes.swiftCode);

                const paymentRails = isUsdUsa
                    ? hasSwiftCode
                        ? [PAYMENT_RAIL_SWIFT]
                        : [PAYMENT_RAIL_ACH, PAYMENT_RAIL_WIRE]
                    : [(baseAttributes.paymentRail as string | null) ?? null];

                const createdRows: BeneficiaryAccount[] = [];
                for (const paymentRail of paymentRails) {
                    const accountRow = await BeneficiaryAccount.create(
                        {
                            ...baseAttributes,
                            uniqueId: generateUniqueId(24),
                            teamMemberId: req.teamMember?.id ?? null,
                            paymentRail,
                        } as never,
                        { transaction: databaseTransaction },
                    );
                    await BeneficiaryAdditionalDetail.create(
                        {
                            ...additionalDetailAttributesFromNormalized(
                                normalized.beneficiaryAccountAdditionalDetail,
                            ),
                            beneficiaryAccountId: accountRow.id,
                        } as never,
                        { transaction: databaseTransaction },
                    );
                    createdRows.push(accountRow);
                }
                if (createdRows.length === 0) {
                    throw new FormFieldsError(
                        res.__("117"),
                        117,
                        400,
                    );
                }
                return createdRows;
            },
        );

        const lastCreated = createdAccounts[createdAccounts.length - 1];
        const refreshedAccount = await BeneficiaryAccount.findByPk(
            lastCreated.id,
            {
                include: [
                    {
                        model: BeneficiaryAdditionalDetail,
                        as: "additionalDetails",
                    },
                ],
            },
        );

        return res.sendResponse(
            {
                beneficiary_account: refreshedAccount
                    ? await beneficiaryAccountToJSON(refreshedAccount)
                    : null,
            },
            "",
            200,
        );
    } catch (error) {
        if (error instanceof FormFieldsError) {
            return res.sendError(
                error.message,
                error.errorCode,
                error.httpStatus,
            );
        }
        return res.handleError(error);
    }
};

/**
 * Response shape for a validation row (mirror of the legacy
 * shapeValidation — account_name only present when known).
 */
const validationToJSON = (
    validationRow: BeneficiaryAccountValidation,
): Record<string, unknown> => {
    const data: Record<string, unknown> = {
        account_number: validationRow.accountNumber ?? "",
        ifsc: validationRow.code ?? "",
        // String literals on purpose — the consumer expects "true"/"false".
        is_nre_account: validationRow.isNreAccount === 1 ? "true" : "false",
        is_account_exists:
            validationRow.isAccountExists === 1 ? "true" : "false",
    };
    if (validationRow.accountName) {
        data.account_name = validationRow.accountName;
    }
    return data;
};

/**
 * POST /api/user/beneficiaries/validate_account
 *
 * Cache-first Indian account verification. Identical account numbers
 * reuse the recorded result; misses hit Processing Unit and persist
 * the normalized row for future hits (with a concurrent-create
 * re-check to avoid the unique-constraint race).
 */
export const validateAccount = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        if (!(await passesTransactionTfa(req))) {
            return res.sendError(res.__("139"), 139, 400);
        }

        const accountNumber = String(req.body.account_number);
        const ifscCode = String(req.body.ifsc);

        const cachedValidation = await BeneficiaryAccountValidation.findOne({
            where: { accountNumber },
        });
        if (cachedValidation) {
            return res.sendResponse(
                { account: validationToJSON(cachedValidation) },
                res.__("success.113"),
                113,
            );
        }

        const merchant = req.user.merchantId
            ? await Merchant.findByPk(req.user.merchantId)
            : null;

        const providerResult = await processingUnitValidateAccount({
            merchant_email: req.user.email,
            merchant_name:
                merchant?.name ?? req.user.firstName ?? req.user.email,
            account_number: accountNumber,
            ifsc_code: ifscCode,
        });

        if (!providerResult.success || !providerResult.data) {
            return res.sendError(
                providerResult.message || res.__("179"),
                179,
                502,
            );
        }

        const providerData = providerResult.data as Record<string, unknown>;
        const targetAccountNumber =
            (providerData.account_number as string) ?? accountNumber;

        // Concurrent-create guard: another request may have persisted
        // this account number while the provider call was in flight.
        const concurrentValidation = await BeneficiaryAccountValidation.findOne(
            { where: { accountNumber: targetAccountNumber } },
        );
        if (concurrentValidation) {
            return res.sendResponse(
                { account: validationToJSON(concurrentValidation) },
                res.__("success.113"),
                113,
            );
        }

        const createdValidation = await BeneficiaryAccountValidation.create({
            uniqueId: generateUniqueId(24),
            userId: req.user.id,
            accountName: (providerData.account_name as string) ?? null,
            accountNumber: targetAccountNumber,
            code: (providerData.ifsc_code as string) ?? ifscCode,
            validationService: "pu",
            externalReferenceId: (providerData.client_id as string) ?? null,
            externalStatus: (providerData.status as string) ?? null,
            externalData: providerData,
            remarks: (providerData.message as string) ?? null,
            isAccountExists:
                String(providerData.is_account_exists ?? "NO").toUpperCase() ===
                "YES"
                    ? 1
                    : 0,
            isNreAccount:
                String(providerData.is_nre_account ?? "NO").toUpperCase() ===
                "YES"
                    ? 1
                    : 0,
            status: 1,
        });

        return res.sendResponse(
            { account: validationToJSON(createdValidation) },
            res.__("success.113"),
            113,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * DELETE /api/user/beneficiaries/delete?beneficiary_account_id=...
 */
export const destroy = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const beneficiaryAccountId = String(req.query.beneficiary_account_id);
        const accountRow = await BeneficiaryAccount.findOne({
            where: {
                userId: req.user.id,
                uniqueId: beneficiaryAccountId,
            },
        });
        if (!accountRow) {
            return res.sendError(res.__("118"), 118, 400);
        }

        // paranoid model -> destroy() sets deleted_at (soft delete).
        await accountRow.destroy();

        return res.sendResponse({}, "Beneficiary deleted successfully.", 200);
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/beneficiaries/bulk/template — builds the beneficiary
 * bulk XLSX template from the beneficiary form fields, uploads it to S3
 * and returns the signed URL. Mirror of the legacy
 * beneficiaryAccountsController.bulkTemplate.
 */
export const bulkTemplate = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const fields = await beneficiaryFormFields({
            country: String(query.country),
            currency: String(query.currency),
            type: Number(query.type ?? 1),
        });
        const flat = flattenFormFields({ beneficiary: fields }, ["beneficiary"]);
        const buffer = await generateBulkTemplate(flat, "Beneficiaries");
        const key = await upload(
            {
                buffer,
                contentType:
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                extension: "xlsx",
            },
            "exports/beneficiary-templates",
        );
        const signedUrl = await temporaryUrl(key);
        return res.sendResponse({ url: signedUrl }, "Template ready.", 200);
    } catch (error) {
        if (error instanceof FormFieldsError) {
            return res.sendError(
                error.message,
                error.errorCode,
                error.httpStatus,
            );
        }
        return res.handleError(error);
    }
};

/**
 * POST /api/user/beneficiaries/bulk/store — validates each row through
 * the beneficiary form fields + normalizer and creates one
 * BeneficiaryAccount (plus its additional-detail row) per row.
 * Duplicate (account_number, currency) pairs — within the spreadsheet
 * or already in the DB — surface as per-row errors. Mirror of the
 * legacy beneficiaryAccountsController.bulkStore.
 *
 * Deferred: the Caliza createBeneficiary background sync (needs the
 * Caliza provider service tranche), consistent with the single-store.
 */
export const bulkStore = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const buffer = extractUploadedFileBuffer(req);
        if (!buffer || buffer.length === 0) {
            return res.sendError(
                "Excel file (multipart 'file') required.",
                422,
                422,
            );
        }

        const body = req.body as {
            country?: string;
            currency?: string;
            type?: number | string;
        };
        const country = String(body.country ?? "");
        const currency = String(body.currency ?? "");
        const type = Number(body.type ?? 1);

        const beneficiary = await beneficiaryFormFields({
            country,
            currency,
            type,
        });
        const fields = flattenFormFields({ beneficiary }, ["beneficiary"]);

        const seenAccounts = new Set<string>();
        const result = await processExcel(
            buffer,
            fields,
            async (payload, rowNumber) => {
                payload.beneficiary.country = country;
                payload.beneficiary.currency = currency;
                const normalized = await validateAndNormalizeBeneficiary(
                    payload.beneficiary as Record<string, unknown>,
                    req.user!,
                );

                const accountNumber = normalized.beneficiaryAccount
                    .account_number as string | undefined;
                const rowCurrency = String(
                    normalized.beneficiaryAccount.currency ?? "",
                );
                if (accountNumber) {
                    const cacheKey = `${accountNumber}|${rowCurrency}`;
                    if (seenAccounts.has(cacheKey)) {
                        throw new Error(
                            `Duplicate account number "${accountNumber}" for currency "${rowCurrency}" found in spreadsheet.`,
                        );
                    }
                    seenAccounts.add(cacheKey);

                    const exists = await BeneficiaryAccount.findOne({
                        where: {
                            userId: req.user!.id,
                            accountNumber,
                            currency: rowCurrency,
                        },
                    });
                    if (exists) {
                        throw new Error(
                            `Beneficiary with account number "${accountNumber}" for currency "${rowCurrency}" already exists.`,
                        );
                    }
                }

                return { row: rowNumber, beneficiary: normalized };
            },
        );

        if (result.errors.length > 0) {
            return res.sendResponse(
                { success: [], errors: result.errors },
                "Bulk import failed.",
                200,
            );
        }

        const created: { row: number; unique_id: string }[] = [];
        for (const row of result.validatedRows) {
            const accountAttributes = beneficiaryAttributesFromNormalized(
                row.beneficiary.beneficiaryAccount,
                req.user.id,
            );
            const account = await BeneficiaryAccount.create({
                ...accountAttributes,
                teamMemberId: req.teamMember?.id ?? null,
            } as never);
            const additionalAttributes =
                additionalDetailAttributesFromNormalized(
                    row.beneficiary.beneficiaryAccountAdditionalDetail,
                );
            await BeneficiaryAdditionalDetail.create({
                ...additionalAttributes,
                beneficiaryAccountId: account.id,
            } as never);
            created.push({ row: row.row, unique_id: account.uniqueId });
        }

        return res.sendResponse(
            { success: created, errors: [] },
            "Bulk import accepted.",
            200,
        );
    } catch (error) {
        if (error instanceof FormFieldsError) {
            return res.sendError(
                error.message,
                error.errorCode,
                error.httpStatus,
            );
        }
        return res.handleError(error);
    }
};
