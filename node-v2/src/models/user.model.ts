import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Trimmed User model containing only the fields required by the auth
 * pilot. Additional fields (device_token, tfa_secret, backup_codes,
 * merchant_id, etc.) will be added as their respective modules are
 * migrated.
 *
 * Column names in MySQL stay snake_case via `underscored: true`; the
 * TypeScript attributes remain camelCase for consistency with the rest
 * of the codebase.
 */

interface UserAttributes {
    id: number;
    uniqueId: string;
    email: string;
    password: string;
    mobileCountryCode: string | null;
    mobile: string | null;
    userType: number;
    userRole: number;
    isTfaEnabled: boolean;
    isTfaSetupCompleted: boolean;
    emailVerifiedAt: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
}

interface UserCreationAttributes
    extends Optional<
        UserAttributes,
        | "id"
        | "mobileCountryCode"
        | "mobile"
        | "userRole"
        | "isTfaEnabled"
        | "isTfaSetupCompleted"
        | "emailVerifiedAt"
    > {}

class User
    extends Model<UserAttributes, UserCreationAttributes>
    implements UserAttributes
{
    public id!: number;
    public uniqueId!: string;
    public email!: string;
    public password!: string;
    public mobileCountryCode!: string | null;
    public mobile!: string | null;
    public userType!: number;
    public userRole!: number;
    public isTfaEnabled!: boolean;
    public isTfaSetupCompleted!: boolean;
    public emailVerifiedAt!: Date | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

User.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        uniqueId: {
            type: DataTypes.STRING(64),
            allowNull: false,
            unique: true,
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
        mobileCountryCode: {
            type: DataTypes.STRING(10),
            allowNull: true,
        },
        mobile: {
            type: DataTypes.STRING(30),
            allowNull: true,
        },
        userType: {
            type: DataTypes.TINYINT.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        userRole: {
            type: DataTypes.TINYINT.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        isTfaEnabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        isTfaSetupCompleted: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        emailVerifiedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: "users",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        defaultScope: {
            attributes: { exclude: ["password"] },
        },
        scopes: {
            withPassword: {
                attributes: { include: ["password"] },
            },
        },
    },
);

export default User;
