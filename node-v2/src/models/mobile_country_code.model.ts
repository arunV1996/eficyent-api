import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Country dial-code / ISO-code reference row. Mirror of the legacy
 * `mobile_country_codes` table used for country dropdowns and flag
 * resolution.
 */

interface MobileCountryCodeAttributes {
    id: number;
    uniqueId: string;
    countryName: string;
    isdCode: string;
    alpha2Code: string;
    alpha3Code: string;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface MobileCountryCodeCreationAttributes
    extends Optional<MobileCountryCodeAttributes, "id" | "status"> {}

class MobileCountryCode
    extends Model<
        MobileCountryCodeAttributes,
        MobileCountryCodeCreationAttributes
    >
    implements MobileCountryCodeAttributes
{
    public id!: number;
    public uniqueId!: string;
    public countryName!: string;
    public isdCode!: string;
    public alpha2Code!: string;
    public alpha3Code!: string;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

MobileCountryCode.init(
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
        isdCode: {
            type: DataTypes.STRING(8),
            allowNull: false,
        },
        alpha2Code: {
            // Explicit field: `underscored` would derive `alpha2_code`,
            // but the actual column (Laravel migration) is `alpha_2_code`.
            field: "alpha_2_code",
            type: DataTypes.STRING(5),
            allowNull: false,
        },
        alpha3Code: {
            field: "alpha_3_code",
            type: DataTypes.STRING(5),
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
        tableName: "mobile_country_codes",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default MobileCountryCode;
