import { Request, Response } from "express";
import { Op, WhereOptions } from "sequelize";
import {
    beneficiaryFormFields,
    FormFieldsError,
} from "../helpers/form_fields.helper";
import BeneficiaryAccount from "../models/beneficiary_account.model";
import BeneficiaryAdditionalDetail from "../models/beneficiary_additional_detail.model";
import { beneficiaryAccountToJSON } from "../resources/beneficiary_account.resource";
import {
    BENEFICIARY_ACCOUNT_STATUS_MAP,
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
