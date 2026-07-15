import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Per-merchant key/value setting row (business_model, payout_countries,
 * ...). Mirror of the legacy `merchant_settings` table.
 */

interface MerchantSettingAttributes {
    id: number;
    uniqueId: string;
    merchantId: number;
    key: string;
    value: string;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface MerchantSettingCreationAttributes
    extends Optional<MerchantSettingAttributes, "id" | "status"> {}

class MerchantSetting
    extends Model<MerchantSettingAttributes, MerchantSettingCreationAttributes>
    implements MerchantSettingAttributes
{
    public id!: number;
    public uniqueId!: string;
    public merchantId!: number;
    public key!: string;
    public value!: string;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

MerchantSetting.init(
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
            field: "unique_id",
        },
        merchantId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },
        key: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        value: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        status: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
    },
    {
        sequelize,
        tableName: "merchant_settings",
        underscored: true,
        timestamps: true,
        indexes: [
            {
                fields: ["merchant_id"],
                name: "merchant_settings_merchant_id_foreign",
            },
        ],
    },
);

export default MerchantSetting;
