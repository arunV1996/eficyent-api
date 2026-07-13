import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * State / province reference row. Mirror of the legacy `states` table
 * used for address dropdowns and state-code -> state-name resolution.
 */

interface StateAttributes {
    id: number;
    uniqueId: string;
    name: string;
    countryCode: string;
    countryAlpha3: string | null;
    stateCode: string;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface StateCreationAttributes
    extends Optional<StateAttributes, "id" | "countryAlpha3" | "status"> {}

class State
    extends Model<StateAttributes, StateCreationAttributes>
    implements StateAttributes
{
    public id!: number;
    public uniqueId!: string;
    public name!: string;
    public countryCode!: string;
    public countryAlpha3!: string | null;
    public stateCode!: string;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

State.init(
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
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        countryCode: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        countryAlpha3: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        stateCode: {
            type: DataTypes.STRING(255),
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
        tableName: "states",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default State;
