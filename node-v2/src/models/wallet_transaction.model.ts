import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import Quote from "./quote.model";
import Wallet from "./wallet.model";

/**
 * Wallet credit/debit row. Mirror of the legacy `wallet_transactions`
 * table.
 */

interface WalletTransactionAttributes {
    id: number;
    uniqueId: string;
    userId: number;
    walletId: number;
    quoteId: number | null;
    beneficiaryTransactionId: number | null;
    amount: string;
    fees: string;
    totalAmount: string;
    transactionId: string | null;
    type: number;
    balanceBefore: string | null;
    balanceAfter: string | null;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface WalletTransactionCreationAttributes
    extends Optional<
        WalletTransactionAttributes,
        | "id"
        | "quoteId"
        | "beneficiaryTransactionId"
        | "amount"
        | "fees"
        | "totalAmount"
        | "transactionId"
        | "type"
        | "balanceBefore"
        | "balanceAfter"
        | "status"
    > {}

class WalletTransaction
    extends Model<
        WalletTransactionAttributes,
        WalletTransactionCreationAttributes
    >
    implements WalletTransactionAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number;
    public walletId!: number;
    public quoteId!: number | null;
    public beneficiaryTransactionId!: number | null;
    public amount!: string;
    public fees!: string;
    public totalAmount!: string;
    public transactionId!: string | null;
    public type!: number;
    public balanceBefore!: string | null;
    public balanceAfter!: string | null;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;

    // Eager-loaded associations (aliases mirror the legacy Prisma
    // include names).
    public readonly wallet?: Wallet;
    public readonly quote?: Quote;
}

WalletTransaction.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        uniqueId: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        walletId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        quoteId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
        beneficiaryTransactionId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0,
        },
        fees: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0,
        },
        totalAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0,
        },
        transactionId: { type: DataTypes.STRING(255), allowNull: true },
        type: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        balanceBefore: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
        balanceAfter: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
        status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
        sequelize,
        tableName: "wallet_transactions",
        underscored: true,
        timestamps: true,
        indexes: [
            {
                fields: ["user_id", "wallet_id"],
                name: "wallet_transactions_user_id_wallet_id_index",
            },
            {
                fields: ["beneficiary_transaction_id"],
                name: "wallet_transactions_beneficiary_transaction_id_index",
            },
        ],
    },
);

WalletTransaction.belongsTo(Wallet, {
    foreignKey: "walletId",
    as: "wallet",
});
WalletTransaction.belongsTo(Quote, {
    foreignKey: "quoteId",
    as: "quote",
});

export default WalletTransaction;
