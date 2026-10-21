import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

/**
 * Synced bank-account balance row (total/used/available) backing the
 * availableBankBalance fast path.
 */
class BankWallet extends Model {
    public id!: number;
    public userId!: number | null;
    public teamMemberId!: number | null;
    public virtualAccountId!: number;
    public currency!: string;
    public totalBalance!: number;
    public usedBalance!: number;
    public availableBalance!: number;
    public lastSyncAt!: Date;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

BankWallet.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        teamMemberId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        virtualAccountId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },
        currency: {
            type: DataTypes.STRING(3),
            allowNull: false,
        },
        totalBalance: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.0,
        },
        usedBalance: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.0,
        },
        availableBalance: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.0,
        },
        lastSyncAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: "bank_wallets",
        underscored: true,
        timestamps: true,
    },
);

export default BankWallet;
