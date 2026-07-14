import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Provider-onboarding state per user (mirror of the legacy
 * `user_services` table). status carries the ONBOARDING_STATUS_* enum.
 */

interface UserServiceAttributes {
    id: number;
    uniqueId: string;
    userId: number;
    serviceType: string;
    externalReferenceId: string | null;
    externalData: unknown | null;
    externalStatus: string | null;
    status: number;
    isActive: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

type OptionalUserServiceFields = Exclude<
    keyof UserServiceAttributes,
    "id" | "uniqueId" | "userId" | "serviceType"
>;

interface UserServiceCreationAttributes
    extends Optional<UserServiceAttributes, "id" | OptionalUserServiceFields> {}

class UserService
    extends Model<UserServiceAttributes, UserServiceCreationAttributes>
    implements UserServiceAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number;
    public serviceType!: string;
    public externalReferenceId!: string | null;
    public externalData!: unknown | null;
    public externalStatus!: string | null;
    public status!: number;
    public isActive!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

UserService.init(
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
        userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        serviceType: { type: DataTypes.STRING(255), allowNull: false },
        externalReferenceId: { type: DataTypes.STRING(255), allowNull: true },
        externalData: { type: DataTypes.JSON, allowNull: true },
        externalStatus: { type: DataTypes.STRING(255), allowNull: true },
        status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
        isActive: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
    },
    {
        sequelize,
        tableName: "user_services",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default UserService;
