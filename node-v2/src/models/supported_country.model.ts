import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Payout corridor definition: which (country, currency) pairs each
 * provider supports, optionally scoped to a payment type (B2B/B2C/...).
 * Mirror of the legacy `supported_countries` table.
 */

interface SupportedCountryAttributes {
    id: number;
    uniqueId: string;
    countryName: string;
    countryCode: string;
    currency: string;
    type: string | null;
    externalType: string | null;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface SupportedCountryCreationAttributes
    extends Optional<
        SupportedCountryAttributes,
        "id" | "type" | "externalType" | "status"
    > {}

class SupportedCountry
    extends Model<
        SupportedCountryAttributes,
        SupportedCountryCreationAttributes
    >
    implements SupportedCountryAttributes
{
    public id!: number;
    public uniqueId!: string;
    public countryName!: string;
    public countryCode!: string;
    public currency!: string;
    public type!: string | null;
    public externalType!: string | null;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

SupportedCountry.init(
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
        countryName: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        countryCode: {
            type: DataTypes.STRING(3),
            allowNull: false,
        },
        currency: {
            type: DataTypes.STRING(3),
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING(3),
            allowNull: true,
        },
        externalType: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        status: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
    },
    {
        sequelize,
        tableName: "supported_countries",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default SupportedCountry;
