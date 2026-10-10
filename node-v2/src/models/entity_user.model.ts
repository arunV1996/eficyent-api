import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Entity-panel user. Mirror of the Laravel `entity_users` table: an
 * operator account scoped to one or more merchant entities, with a
 * JSON module allowlist.
 */

interface EntityUserAttributes {
    id: number;
    uniqueId: string;
    name: string;
    email: string;
    password: string;
    entityIds: unknown | null;
    modules: unknown | null;
    lastPasswordReset: Date | null;
    timezone: string;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface EntityUserCreationAttributes
    extends Optional<
        EntityUserAttributes,
        | "id"
        | "entityIds"
        | "modules"
        | "lastPasswordReset"
        | "timezone"
        | "status"
    > {}

class EntityUser
    extends Model<EntityUserAttributes, EntityUserCreationAttributes>
    implements EntityUserAttributes
{
    public id!: number;
    public uniqueId!: string;
    public name!: string;
    public email!: string;
    public password!: string;
    public entityIds!: unknown | null;
    public modules!: unknown | null;
    public lastPasswordReset!: Date | null;
    public timezone!: string;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

EntityUser.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        uniqueId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        name: {
            type: DataTypes.STRING(25),
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        entityIds: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        modules: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        lastPasswordReset: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        timezone: {
            type: DataTypes.STRING(30),
            allowNull: false,
            defaultValue: "Asia/Kolkata",
        },
        status: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
    },
    {
        sequelize,
        tableName: "entity_users",
        underscored: true,
        timestamps: true,
    },
);

export default EntityUser;
