import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Per-currency user wallet. Mirror of the legacy `wallets` table
 * (unique on user_id + currency).
 */

interface WalletAttributes {
    id: number;
    uniqueId: string;
    userId: number;
    currency: string;
    balance: string;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface WalletCreationAttributes
    extends Optional<WalletAttributes, "id" | "balance" | "status"> {}

class Wallet
    extends Model<WalletAttributes, WalletCreationAttributes>
    implements WalletAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number;
    public currency!: string;
    public balance!: string;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

Wallet.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        uniqueId: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },
        userId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },
        currency: {
            type: DataTypes.STRING(3),
            allowNull: false,
        },
        balance: {
            type: DataTypes.DECIMAL(20, 4),
            allowNull: false,
            defaultValue: 0,
        },
        status: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
    },
    {
        sequelize,
        tableName: "wallets",
        underscored: true,
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ["user_id", "currency"],
                name: "wallets_user_id_currency_unique",
            },
        ],
    },
);

export default Wallet;
