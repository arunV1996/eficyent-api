import { DataTypes, Model } from "sequelize";
import { payoutSequelize } from "../config/database";

/** Archived (settled or purged) payout queue rows. */
class PayoutTransactionArchive extends Model {
    public id!: number;
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

PayoutTransactionArchive.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
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
        tableName: "payout_transactions_archive",
        underscored: true,
        timestamps: true,
    },
);

export default PayoutTransactionArchive;
