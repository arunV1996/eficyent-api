import { Request, Response } from "express";
import { Op } from "sequelize";
import sequelize from "../config/database";
import { CodedError } from "../helpers/coded_error.helper";
import { senderFields } from "../helpers/form_fields.helper";
import { isRemitterDepositEnabled } from "../helpers/payout_transaction.helper";
import { validateAndNormalizeSender } from "../helpers/sender_normalizer.helper";
import Merchant from "../models/merchant.model";
import Sender from "../models/sender.model";
import SenderDocument from "../models/sender_document.model";
import User from "../models/user.model";
import { senderToJSON } from "../resources/sender.resource";
import { uploadBase64 } from "../services/s3.service";
import { generateUniqueId } from "../utils/common.utils";
import {
    REMITTER_STATUS_MAP,
    SENDER_STATUS_APPROVED,
    SENDER_STATUS_PENDING,
    TAKE_COUNT,
    USER_TYPE_BUSINESS,
    USER_TYPE_MAP,
    USER_TYPE_PERSONAL,
} from "../utils/constants";

const SENDER_DOCUMENT_PATH = "user_documents";

/**
 * Mirror of Api\SenderController + SenderRepository (via the legacy
 * senderController). The Sender model is paranoid, so the legacy
 * `deleted_at: null` scoping is automatic.
 *
 * Deferred (documented):
 *   - /bulk/template + /bulk/store (Excel import/export service)
 *   - team-member token context (creator is always the user here)
 */

const sendCodedError = (res: Response, error: unknown): void => {
    if (error instanceof CodedError) {
        return res.sendError(error.message, error.errorCode, error.httpStatus);
    }
    return res.handleError(error);
};

const NUMERIC_KEYS = new Set(["type", "status"]);
const SENDER_COLUMN_MAP: Record<string, string> = {
    first_name: "firstName",
    middle_name: "middleName",
    last_name: "lastName",
    email: "email",
    mobile_country_code: "mobileCountryCode",
    mobile: "mobile",
    dob: "dob",
    country: "country",
    nationality: "nationality",
    address_1: "address1",
    address_2: "address2",
    city: "city",
    state: "state",
    postal_code: "postalCode",
    type: "type",
    id_type: "idType",
    id_number: "idNumber",
    source_of_funds: "sourceOfFunds",
    business_persons: "businessPersons",
    client_reference_id: "clientReferenceId",
    status: "status",
};

/**
 * Maps the snake_case normalized payload onto Sender attribute names
 * (mirror of the legacy toPrismaSender).
 */
const toSenderColumns = (
    payload: Record<string, unknown>,
): Record<string, unknown> => {
    const columns: Record<string, unknown> = {};
    for (const [key, rawValue] of Object.entries(payload)) {
        const destination = SENDER_COLUMN_MAP[key];
        if (!destination) {
            continue;
        }
        let value: unknown = rawValue;
        if (destination === "dob" && typeof rawValue === "string") {
            value = new Date(rawValue);
        }
        if (NUMERIC_KEYS.has(key) && typeof rawValue === "string") {
            value = Number(rawValue);
        }
        columns[destination] = value;
    }
    return columns;
};

const senderIncludes = () => [
    { model: SenderDocument, as: "documents", required: false },
    {
        model: User,
        as: "user",
        required: false,
        attributes: ["timezone"],
    },
];

/**
 * GET /api/user/remitters/get-form-fields
 */
export const getFormFields = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        let type = query.type
            ? USER_TYPE_MAP[query.type]
            : USER_TYPE_PERSONAL;
        let prefill: Sender | null = null;
        if (query.remitter_id) {
            prefill = await Sender.findOne({
                where: { userId: req.user.id, uniqueId: query.remitter_id },
            });
            if (!prefill) {
                return res.sendError("Sender not found.", 143, 400);
            }
            type = prefill.type ?? USER_TYPE_PERSONAL;
        }

        const merchant = req.user.merchantId
            ? await Merchant.findByPk(req.user.merchantId)
            : null;
        const fields = await senderFields({
            type: type as number,
            merchantId: merchant?.id ?? null,
            remitterDepositEnabled: await isRemitterDepositEnabled(
                req.user.merchantId,
            ),
        });

        const filled = prefill
            ? fields.map((field) => {
                  // business_name is stored on first_name for business
                  // senders.
                  if (field.field_key === "business_name") {
                      return { ...field, field_value: prefill!.firstName ?? "" };
                  }
                  const value = (
                      prefill as unknown as Record<string, unknown>
                  )[field.field_key];
                  return {
                      ...field,
                      field_value:
                          typeof value === "string" ||
                          typeof value === "number"
                              ? value
                              : "",
                  };
              })
            : fields;

        return res.sendResponse({ form_fields: filled }, "", 200);
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/remitters/list
 */
export const index = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const status =
            query.status && query.status in REMITTER_STATUS_MAP
                ? REMITTER_STATUS_MAP[query.status]
                : null;
        const type = query.type ? USER_TYPE_MAP[query.type] : null;

        const searchConditions: Record<string | symbol, unknown>[] = [];
        if (query.search_key) {
            const searchTerm = `%${query.search_key}%`;
            searchConditions.push(
                { email: { [Op.like]: searchTerm } },
                { uniqueId: { [Op.like]: searchTerm } },
                { firstName: { [Op.like]: searchTerm } },
                { lastName: { [Op.like]: searchTerm } },
                { middleName: { [Op.like]: searchTerm } },
                { mobile: { [Op.like]: searchTerm } },
                { idNumber: { [Op.like]: searchTerm } },
            );

            const parts = query.search_key.trim().split(/\s+/).filter(Boolean);
            if (parts.length > 1) {
                searchConditions.push({
                    [Op.and]: parts.map((part) => ({
                        [Op.or]: [
                            { firstName: { [Op.like]: `%${part}%` } },
                            { middleName: { [Op.like]: `%${part}%` } },
                            { lastName: { [Op.like]: `%${part}%` } },
                        ],
                    })),
                });
            }
        }

        const where: Record<string | symbol, unknown> = {
            userId: req.user.id,
        };
        if (type !== null && type !== undefined) {
            where.type = type;
        }
        if (status !== null) {
            where.status = status;
        }
        if (searchConditions.length > 0) {
            where[Op.or] = searchConditions;
        }

        const skip = req.query.skip !== undefined ? Number(req.query.skip) : 0;
        const take =
            req.query.take !== undefined ? Number(req.query.take) : TAKE_COUNT;
        const [total, rows] = await Promise.all([
            Sender.count({ where }),
            Sender.findAll({
                where,
                offset: skip,
                limit: take,
                order: [["created_at", "DESC"]],
                include: senderIncludes(),
            }),
        ]);

        const remitters = [];
        for (const row of rows) {
            remitters.push(await senderToJSON(row));
        }
        return res.sendResponse({ total, remitters }, "", "");
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/remitters/store
 */
export const store = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const depositEnabled = await isRemitterDepositEnabled(
            req.user.merchantId,
        );
        const validated = await validateAndNormalizeSender(
            req.body as Record<string, unknown>,
            req.user,
            depositEnabled,
        );

        const idNumber = validated.id_number as string | undefined;
        if (idNumber) {
            const exists = await Sender.findOne({
                where: { userId: req.user.id, idNumber },
            });
            if (exists) {
                return res.sendError(
                    "A sender with this ID number already exists.",
                    130,
                    400,
                );
            }
        }

        const senderColumns = toSenderColumns(
            validated as Record<string, unknown>,
        );
        const initialStatus =
            validated.type === USER_TYPE_PERSONAL
                ? SENDER_STATUS_APPROVED
                : SENDER_STATUS_PENDING;

        const created = await sequelize.transaction(
            async (databaseTransaction) => {
                const sender = await Sender.create(
                    {
                        ...senderColumns,
                        uniqueId: generateUniqueId(24),
                        userId: req.user!.id,
                        teamMemberId: null,
                        status: initialStatus,
                    } as never,
                    { transaction: databaseTransaction },
                );
                if (validated.type === USER_TYPE_BUSINESS) {
                    const proofs = (
                        validated as Record<string, unknown>
                    ).proofs as
                        | {
                              document_file?: string;
                              document_type?: string;
                              document_country?: string;
                          }
                        | undefined;
                    if (proofs?.document_file) {
                        const file = proofs.document_file.startsWith("data:")
                            ? await uploadBase64(
                                  proofs.document_file,
                                  SENDER_DOCUMENT_PATH,
                              )
                            : proofs.document_file;
                        if (!file) {
                            throw new CodedError(
                                "File upload failed.",
                                109,
                                400,
                            );
                        }
                        await SenderDocument.create(
                            {
                                uniqueId: generateUniqueId(24),
                                senderId: sender.id,
                                documentName: "Proofs",
                                documentFile: file,
                                documentType: proofs.document_type ?? null,
                                documentCountry:
                                    proofs.document_country ?? null,
                            },
                            { transaction: databaseTransaction },
                        );
                    }
                }
                return sender;
            },
        );

        const refreshed = await Sender.findOne({
            where: { id: created.id },
            include: senderIncludes(),
        });
        return res.sendResponse(
            { remitter: await senderToJSON(refreshed!) },
            "Remitter created successfully.",
            "",
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/remitters/update
 */
export const update = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const body = req.body as Record<string, unknown>;
        const sender = await Sender.findOne({
            where: {
                userId: req.user.id,
                uniqueId: String(body.remitter_id),
            },
        });
        if (!sender) {
            return res.sendError("Sender not found.", 132, 400);
        }

        // Re-validate against the sender's current type.
        const depositEnabled = await isRemitterDepositEnabled(
            req.user.merchantId,
        );
        const payload: Record<string, unknown> = {
            ...body,
            type: sender.type ?? USER_TYPE_PERSONAL,
        };
        delete payload.remitter_id;
        const validated = await validateAndNormalizeSender(
            payload,
            req.user,
            depositEnabled,
        );

        const updateColumns = toSenderColumns(
            validated as Record<string, unknown>,
        );
        delete updateColumns.type; // type doesn't change on update
        await sender.update(updateColumns as never);

        const refreshed = await Sender.findOne({
            where: { id: sender.id },
            include: senderIncludes(),
        });
        return res.sendResponse(
            { remitter: await senderToJSON(refreshed!) },
            "Remitter updated successfully.",
            "",
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/remitters/show
 */
export const show = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const where: Record<string, unknown> = { userId: req.user.id };
        if (query.remitter_id) {
            where.uniqueId = query.remitter_id;
        } else if (query.id_number) {
            where.idNumber = query.id_number;
        } else if (query.email) {
            where.email = query.email;
        }

        const sender = await Sender.findOne({
            where,
            include: senderIncludes(),
        });
        if (!sender) {
            return res.sendError("Sender not found.", 132, 400);
        }
        // Legacy quirk preserved: the success envelope carries code 132.
        return res.sendResponse(
            { remitter: await senderToJSON(sender) },
            "Remitter fetched successfully.",
            132,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * DELETE /api/user/remitters/delete
 */
export const destroy = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const remitterId = req.query.remitter_id as string | undefined;
        if (!remitterId) {
            return res.sendError("Sender not found.", 132, 400);
        }
        const sender = await Sender.findOne({
            where: { userId: req.user.id, uniqueId: remitterId },
        });
        if (!sender) {
            return res.sendError("Sender not found.", 132, 400);
        }
        await sender.destroy();
        // Legacy quirk preserved: the success envelope carries code 133.
        return res.sendResponse({}, "Remitter deleted successfully.", 133);
    } catch (error) {
        return sendCodedError(res, error);
    }
};
