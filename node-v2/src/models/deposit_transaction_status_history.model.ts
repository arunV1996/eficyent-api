import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Audit trail row for a deposit transaction's status transitions.
 * Mirror of the legacy `deposit_transaction_status_histories` table.
 */

interface DepositTransactionStatusHistoryAttributes {
    id: number;
    uniqueId: string;
    depositTransactionId: number;
    fromStatus: string | null;
    toStatus: string;
    changedBy: string | null;
    changedByType: string | null;
    changedAt: Date;
    meta: unknown | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface DepositTransactionStatusHistoryCreationAttributes
    extends Optional<
        DepositTransactionStatusHistoryAttributes,
        "id" | "fromStatus" | "changedBy" | "changedByType" | "meta"
    > {}

class DepositTransactionStatusHistory
    extends Model<
        DepositTransactionStatusHistoryAttributes,
        DepositTransactionStatusHistoryCreationAttributes
    >
    implements DepositTransactionStatusHistoryAttributes
{
    public id!: number;
    public uniqueId!: string;
    public depositTransactionId!: number;
    public fromStatus!: string | null;
    public toStatus!: string;
    public changedBy!: string | null;
    public changedByType!: string | null;
    public changedAt!: Date;
    public meta!: unknown | null;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

DepositTransactionStatusHistory.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        uniqueId: { type: DataTypes.STRING(255), allowNull: false },
        depositTransactionId: {
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
        tableName: "deposit_transaction_status_histories",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default DepositTransactionStatusHistory;
