import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Immutable status transition log per beneficiary transaction.
 * Mirror of the legacy `beneficiary_transaction_status_histories`.
 */

interface StatusHistoryAttributes {
    id: number;
    uniqueId: string;
    beneficiaryTransactionId: number;
    fromStatus: string | null;
    toStatus: string;
    changedBy: string | null;
    changedByType: string | null;
    changedAt: Date;
    meta: unknown | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface StatusHistoryCreationAttributes
    extends Optional<
        StatusHistoryAttributes,
        "id" | "fromStatus" | "changedBy" | "changedByType" | "meta"
    > {}

class BeneficiaryTransactionStatusHistory
    extends Model<StatusHistoryAttributes, StatusHistoryCreationAttributes>
    implements StatusHistoryAttributes
{
    public id!: number;
    public uniqueId!: string;
    public beneficiaryTransactionId!: number;
    public fromStatus!: string | null;
    public toStatus!: string;
    public changedBy!: string | null;
    public changedByType!: string | null;
    public changedAt!: Date;
    public meta!: unknown | null;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

BeneficiaryTransactionStatusHistory.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        uniqueId: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        beneficiaryTransactionId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },
        fromStatus: { type: DataTypes.STRING(255), allowNull: true },
        toStatus: { type: DataTypes.STRING(255), allowNull: false },
        changedBy: { type: DataTypes.STRING(255), allowNull: true },
        changedByType: { type: DataTypes.STRING(255), allowNull: true },
        changedAt: { type: DataTypes.DATE, allowNull: false },
        meta: { type: DataTypes.JSON, allowNull: true },
    },
    {
        sequelize,
        tableName: "beneficiary_transaction_status_histories",
        underscored: true,
        timestamps: true,
        indexes: [
            {
                fields: ["beneficiary_transaction_id"],
                name: "beneficiary_transaction_status_histories_txn_index",
            },
        ],
    },
);

export default BeneficiaryTransactionStatusHistory;
