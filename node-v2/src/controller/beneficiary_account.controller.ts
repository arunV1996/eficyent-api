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
import BeneficiaryAdditionalDetail from "../models/beneficiary_additional_detail.model";
import { beneficiaryAccountToJSON } from "../resources/beneficiary_account.resource";
import { generateUniqueId } from "../utils/common.utils";
import {
    BENEFICIARY_ACCOUNT_ACTIVATED,
    BENEFICIARY_ACCOUNT_STATUS_MAP,
    PAYMENT_RAIL_ACH,
    PAYMENT_RAIL_SWIFT,
    PAYMENT_RAIL_WIRE,
    TAKE_COUNT,
    USER_TYPE_MAP,
} from "../utils/constants";

/**
 * Mirror of Api\BeneficiaryAccountsController — read/delete endpoints.
 *
 * Deferred with their dependencies: store (beneficiary normalizer +
 * Caliza), validate_account (ProcessingUnit), get-form-fields
 * (beneficiaryFormFields builder needs SupportedCountry), bulk/*
 * (Excel import service). Team-member corporate scoping on list
 * arrives with the team module.
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
            return res.sendError(res.__("401"), 401, 401);
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
        });

        return res.sendResponse({ form_fields: fields }, "OK", 200);
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
            return res.sendError(res.__("401"), 401, 401);
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
            "OK",
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
            return res.sendError(res.__("401"), 401, 401);
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
            return res.sendError(res.__("401"), 401, 401);
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
            "OK",
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
 * DELETE /api/user/beneficiaries/delete?beneficiary_account_id=...
 */
export const destroy = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("401"), 401, 401);
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
