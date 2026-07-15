import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Deposit (top-up) transaction row. Mirror of the legacy
 * `deposit_transactions` table.
 */

interface DepositTransactionAttributes {
    id: number;
    uniqueId: string;
    userId: number;
    teamMemberId: number | null;
    virtualAccountId: number;
    adminWalletId: number | null;
    amount: string;
    commissionAmount: string;
    externalCommissionAmount: string;
    merchantCommissionAmount: string;
    totalCommissionAmount: string;
    totalAmount: string;
    depositCurrency: string | null;
    fromWalletAddress: string | null;
    transactionHash: string | null;
    memo: string | null;
    externalType: string | null;
    externalReferenceId: string | null;
    externalData: unknown | null;
    externalStatus: string | null;
    externalRemarks: string | null;
    remarks: string | null;
    clientReferenceId: string | null;
    status: number;
    type: string;
    purposeOfPayment: string | null;
    sourceOfFunds: string | null;
    proof: string | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

type OptionalDepositFields = Exclude<
    keyof DepositTransactionAttributes,
    "id" | "uniqueId" | "userId" | "virtualAccountId"
>;

interface DepositTransactionCreationAttributes
    extends Optional<
        DepositTransactionAttributes,
        "id" | OptionalDepositFields
    > {}

class DepositTransaction
    extends Model<
        DepositTransactionAttributes,
        DepositTransactionCreationAttributes
    >
    implements DepositTransactionAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number;
    public teamMemberId!: number | null;
    public virtualAccountId!: number;
    public adminWalletId!: number | null;
    public amount!: string;
    public commissionAmount!: string;
    public externalCommissionAmount!: string;
    public merchantCommissionAmount!: string;
    public totalCommissionAmount!: string;
    public totalAmount!: string;
    public depositCurrency!: string | null;
    public fromWalletAddress!: string | null;
    public transactionHash!: string | null;
    public memo!: string | null;
    public externalType!: string | null;
    public externalReferenceId!: string | null;
    public externalData!: unknown | null;
    public externalStatus!: string | null;
    public externalRemarks!: string | null;
    public remarks!: string | null;
    public clientReferenceId!: string | null;
    public status!: number;
    public type!: string;
    public purposeOfPayment!: string | null;
    public sourceOfFunds!: string | null;
    public proof!: string | null;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

const money = (allowNull = false) => ({
    type: DataTypes.DECIMAL(15, 2),
    allowNull,
    defaultValue: 0,
});

DepositTransaction.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        uniqueId: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        teamMemberId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
        virtualAccountId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        adminWalletId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
        amount: money(),
        commissionAmount: money(),
        externalCommissionAmount: money(),
        merchantCommissionAmount: money(),
        totalCommissionAmount: money(),
        totalAmount: money(),
        depositCurrency: { type: DataTypes.STRING(10), allowNull: true },
        fromWalletAddress: { type: DataTypes.STRING(255), allowNull: true },
        transactionHash: { type: DataTypes.STRING(255), allowNull: true },
        memo: { type: DataTypes.STRING(255), allowNull: true },
        externalType: { type: DataTypes.STRING(255), allowNull: true },
        externalReferenceId: { type: DataTypes.STRING(255), allowNull: true },
        externalData: { type: DataTypes.JSON, allowNull: true },
        externalStatus: { type: DataTypes.STRING(255), allowNull: true },
        externalRemarks: { type: DataTypes.TEXT, allowNull: true },
        remarks: { type: DataTypes.TEXT, allowNull: true },
        clientReferenceId: { type: DataTypes.STRING(255), allowNull: true },
        status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        type: {
            type: DataTypes.STRING(255),
            allowNull: false,
            defaultValue: "deposit",
        },
        purposeOfPayment: { type: DataTypes.STRING(255), allowNull: true },
        sourceOfFunds: { type: DataTypes.STRING(255), allowNull: true },
        proof: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
        sequelize,
        tableName: "deposit_transactions",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default DepositTransaction;
