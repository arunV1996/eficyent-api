import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Audit row for every outbound provider call and inbound webhook.
 * Mirror of the legacy `external_service_calls` table — including the
 * fixed FK columns to beneficiary_transactions / deposit_transactions
 * (this table is NOT polymorphic; see the production audit-write fix
 * in /node for the history).
 */

interface ExternalServiceCallAttributes {
    id: number;
    beneficiaryTransactionId: number | null;
    depositTransactionId: number | null;
    externalType: string;
    action: string;
    method: string | null;
    endpoint: string | null;
    requestPayload: unknown | null;
    responsePayload: unknown | null;
    httpStatus: number | null;
    success: boolean;
    externalReferenceId: string | null;
    errorMessage: string | null;
    responseTimeMs: number | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface ExternalServiceCallCreationAttributes
    extends Optional<
        ExternalServiceCallAttributes,
        | "id"
        | "beneficiaryTransactionId"
        | "depositTransactionId"
        | "method"
        | "endpoint"
        | "requestPayload"
        | "responsePayload"
        | "httpStatus"
        | "success"
        | "externalReferenceId"
        | "errorMessage"
        | "responseTimeMs"
    > {}

class ExternalServiceCall
    extends Model<
        ExternalServiceCallAttributes,
        ExternalServiceCallCreationAttributes
    >
    implements ExternalServiceCallAttributes
{
    public id!: number;
    public beneficiaryTransactionId!: number | null;
    public depositTransactionId!: number | null;
    public externalType!: string;
    public action!: string;
    public method!: string | null;
    public endpoint!: string | null;
    public requestPayload!: unknown | null;
    public responsePayload!: unknown | null;
    public httpStatus!: number | null;
    public success!: boolean;
    public externalReferenceId!: string | null;
    public errorMessage!: string | null;
    public responseTimeMs!: number | null;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

ExternalServiceCall.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        beneficiaryTransactionId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        depositTransactionId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        externalType: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        action: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        method: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        endpoint: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        requestPayload: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        responsePayload: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        httpStatus: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        success: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        externalReferenceId: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        errorMessage: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        responseTimeMs: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: "external_service_calls",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        indexes: [
            {
                fields: ["beneficiary_transaction_id"],
                name: "external_service_calls_beneficiary_transaction_id_index",
            },
            {
                fields: ["deposit_transaction_id"],
                name: "external_service_calls_deposit_transaction_id_index",
            },
        ],
    },
);

export default ExternalServiceCall;
