import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Durable payout-job handle used for retries and ops dashboards.
 * Mirror of the legacy `payout_jobs` table.
 */

interface PayoutJobAttributes {
    id: number;
    uniqueId: string;
    batchId: string | null;
    rowNumber: number | null;
    beneficiaryTransactionId: number | null;
    userId: number;
    amount: string | null;
    status: number;
    attempts: number;
    errorMessage: string | null;
    payload: unknown;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface PayoutJobCreationAttributes
    extends Optional<
        PayoutJobAttributes,
        | "id"
        | "batchId"
        | "rowNumber"
        | "beneficiaryTransactionId"
        | "amount"
        | "status"
        | "attempts"
        | "errorMessage"
    > {}

class PayoutJob
    extends Model<PayoutJobAttributes, PayoutJobCreationAttributes>
    implements PayoutJobAttributes
{
    public id!: number;
    public uniqueId!: string;
    public batchId!: string | null;
    public rowNumber!: number | null;
    public beneficiaryTransactionId!: number | null;
    public userId!: number;
    public amount!: string | null;
    public status!: number;
    public attempts!: number;
    public errorMessage!: string | null;
    public payload!: unknown;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

PayoutJob.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        uniqueId: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        batchId: { type: DataTypes.STRING(255), allowNull: true },
        rowNumber: { type: DataTypes.INTEGER, allowNull: true },
        beneficiaryTransactionId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        amount: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
        status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        errorMessage: { type: DataTypes.TEXT, allowNull: true },
        payload: { type: DataTypes.JSON, allowNull: false },
    },
    {
        sequelize,
        tableName: "payout_jobs",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        indexes: [
            { fields: ["status"], name: "payout_jobs_status_index" },
            { fields: ["user_id"], name: "payout_jobs_user_id_index" },
            { fields: ["batch_id"], name: "payout_jobs_batch_id_index" },
        ],
    },
);

export default PayoutJob;
