import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Generic key/value lookup row grouped by `type` (professions,
 * business_types, id_types, ...). Mirror of the legacy `lookups` table.
 */

interface LookupAttributes {
    id: number;
    uniqueId: string;
    key: string;
    value: string;
    type: string;
    externalType: string;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface LookupCreationAttributes
    extends Optional<LookupAttributes, "id" | "externalType" | "status"> {}

class Lookup
    extends Model<LookupAttributes, LookupCreationAttributes>
    implements LookupAttributes
{
    public id!: number;
    public uniqueId!: string;
    public key!: string;
    public value!: string;
    public type!: string;
    public externalType!: string;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

Lookup.init(
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
        key: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        value: {
            type: DataTypes.TEXT("long"),
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        externalType: {
            type: DataTypes.STRING(255),
            allowNull: false,
            defaultValue: "ed",
        },
        status: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
    },
    {
        sequelize,
        tableName: "lookups",
        underscored: true,
        timestamps: true,
    },
);

export default Lookup;
