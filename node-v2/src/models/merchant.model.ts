import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Merchant row (white-label / integrator tenant). Mirror of the legacy
 * `merchants` table. The key/credential columns are excluded from the
 * default scope so they never leak into serialized responses.
 */

interface MerchantAttributes {
    id: number;
    uniqueId: string;
    userId: number;
    name: string;
    email: string;
    password?: string;
    apiKey: string | null;
    saltKey: string | null;
    privateKey: string | null;
    publicKey: string | null;
    callbackUrl: string | null;
    telegramChannel: string | null;
    type: number;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
}

interface MerchantCreationAttributes
    extends Optional<
        MerchantAttributes,
        | "id"
        | "apiKey"
        | "saltKey"
        | "privateKey"
        | "publicKey"
        | "callbackUrl"
        | "telegramChannel"
        | "type"
        | "status"
    > {}

class Merchant
    extends Model<MerchantAttributes, MerchantCreationAttributes>
    implements MerchantAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number;
    public name!: string;
    public email!: string;
    public password!: string;
    public apiKey!: string | null;
    public saltKey!: string | null;
    public privateKey!: string | null;
    public publicKey!: string | null;
    public callbackUrl!: string | null;
    public telegramChannel!: string | null;
    public type!: number;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
    public readonly deletedAt!: Date | null;
}

Merchant.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        uniqueId: {
            type: DataTypes.STRING(40),
            allowNull: false,
            unique: true,
        },
        userId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },
        password: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        apiKey: {
            type: DataTypes.TEXT("long"),
            allowNull: true,
        },
        saltKey: {
            type: DataTypes.TEXT("long"),
            allowNull: true,
        },
        privateKey: {
            type: DataTypes.TEXT("long"),
            allowNull: true,
        },
        publicKey: {
            type: DataTypes.TEXT("long"),
            allowNull: true,
        },
        callbackUrl: {
            type: DataTypes.TEXT("long"),
            allowNull: true,
        },
        telegramChannel: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "telegram_channel",
        },
        type: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
        status: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
    },
    {
        sequelize,
        tableName: "merchants",
        underscored: true,
        timestamps: true,
        paranoid: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        deletedAt: "deleted_at",
        defaultScope: {
            attributes: {
                exclude: ["password", "apiKey", "saltKey", "privateKey"],
            },
        },
        scopes: {
            withSecrets: {
                attributes: { include: [] },
            },
        },
        indexes: [
            {
                fields: ["user_id"],
                name: "merchants_user_id_foreign",
            },
        ],
    },
);

export default Merchant;
