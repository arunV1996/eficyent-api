import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Key/value application settings row (mirror of the legacy `settings`
 * table used by Setting::get() in Laravel and settingsService in /node).
 */

interface SettingAttributes {
    id: number;
    key: string;
    value: string;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface SettingCreationAttributes
    extends Optional<SettingAttributes, "id"> {}

class Setting
    extends Model<SettingAttributes, SettingCreationAttributes>
    implements SettingAttributes
{
    public id!: number;
    public key!: string;
    public value!: string;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

Setting.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        key: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        value: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
    },
    {
        sequelize,
        tableName: "settings",
        underscored: true,
        timestamps: true,
        indexes: [
            {
                fields: ["key"],
                name: "settings_key_index",
            },
        ],
    },
);

export default Setting;
