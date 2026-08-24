import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Seeded city directory row — countries with rows here render address
 * city fields as dropdowns; everyone else keeps the free-text input.
 */

interface CityAttributes {
    id: number;
    uniqueId: string;
    city: string;
    state: string | null;
    country: string;
    externalType: string;
    status: number;
    createdAt?: Date;
    updatedAt?: Date;
}

interface CityCreationAttributes
    extends Optional<CityAttributes, "id" | "state" | "externalType" | "status"> {}

class City
    extends Model<CityAttributes, CityCreationAttributes>
    implements CityAttributes
{
    public id!: number;
    public uniqueId!: string;
    public city!: string;
    public state!: string | null;
    public country!: string;
    public externalType!: string;
    public status!: number;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

City.init(
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
        city: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        state: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        country: {
            type: DataTypes.STRING(3),
            allowNull: false,
        },
        externalType: {
            type: DataTypes.STRING(11),
            allowNull: false,
            defaultValue: "EPF",
        },
        status: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
        },
    },
    {
        sequelize,
        tableName: "cities",
        underscored: true,
        timestamps: true,
    },
);

export default City;
