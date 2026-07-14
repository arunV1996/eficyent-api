import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Platform-owned crypto wallet a user can deposit into. Mirror of the
 * legacy `admin_wallets` table (soft-deleted).
 */

interface AdminWalletAttributes {
    id: number;
    uniqueId: string;
    walletName: string;
    walletAddress: string;
    network: string | null;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
}

type OptionalAdminWalletFields = Exclude<
    keyof AdminWalletAttributes,
    "id" | "uniqueId" | "walletName" | "walletAddress"
>;

interface AdminWalletCreationAttributes
    extends Optional<AdminWalletAttributes, "id" | OptionalAdminWalletFields> {}

class AdminWallet
    extends Model<AdminWalletAttributes, AdminWalletCreationAttributes>
    implements AdminWalletAttributes
{
    public id!: number;
    public uniqueId!: string;
    public walletName!: string;
    public walletAddress!: string;
    public network!: string | null;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
    public readonly deletedAt!: Date | null;
}

AdminWallet.init(
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
        walletName: { type: DataTypes.STRING(50), allowNull: false },
        walletAddress: { type: DataTypes.STRING(255), allowNull: false },
        network: { type: DataTypes.STRING(50), allowNull: true },
        status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    },
    {
        sequelize,
        tableName: "admin_wallets",
        underscored: true,
        timestamps: true,
        paranoid: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        deletedAt: "deleted_at",
    },
);

export default AdminWallet;
