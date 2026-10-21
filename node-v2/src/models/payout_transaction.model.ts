import { DataTypes, Model } from "sequelize";
import { payoutSequelize } from "../config/database";

/**
 * Queued payout accepted by the API (secondary payout DB). The Redis
 * worker drains these into real beneficiary transactions; the sweeper
 * archives settled/refunded rows nightly.
 */
class PayoutTransaction extends Model {
    public id!: number;
    public clientReferenceId!: string | null;
    public txnRefNo!: string | null;
    public teamMemberId!: number | null;
    public beneficiaryAccountId!: number | null;
    public quoteId!: number | null;
    public virtualAccountId!: number | null;
    public walletId!: number | null;
    public commissionAmount!: number | null;
    public recipientAmount!: number | null;
    public type!: string | null;
    public userId!: number;
    public uniqueId!: string;
    public orderId!: string;
    public sendingCurrency!: string | null;
    public receivingCurrency!: string | null;
    public amount!: number | null;
    public totalAmount!: number | null;
    public fees!: number | null;
    public status!: string;
    public payoutStatus!: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public payload!: Record<string, any>;
    public errorMessage!: string | null;
    public processedAt!: Date | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

PayoutTransaction.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        clientReferenceId: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        txnRefNo: {
            type: DataTypes.STRING(255),
            allowNull: true,
            unique: true,
        },
        teamMemberId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        beneficiaryAccountId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        quoteId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        virtualAccountId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        walletId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        commissionAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        recipientAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        type: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        userId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },
        uniqueId: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },
        orderId: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },
        sendingCurrency: {
            type: DataTypes.STRING(3),
            allowNull: true,
        },
        receivingCurrency: {
            type: DataTypes.STRING(3),
            allowNull: true,
        },
        amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        totalAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        fees: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        status: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        payoutStatus: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        payload: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        errorMessage: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        processedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize: payoutSequelize,
        tableName: "payout_transactions",
        underscored: true,
        timestamps: true,
    },
);

export default PayoutTransaction;
