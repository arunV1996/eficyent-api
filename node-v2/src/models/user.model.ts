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
    merchantId: number | null;
    title: string | null;
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
    email: string;
    password: string;
    mobileCountryCode: string | null;
    mobile: string | null;
    gender: string | null;
    dob: Date | null;
    userType: number;
    userRole: number;
    onboardingStep: number;
    idVerification: number;
    enableSender: number;
    isTfaEnabled: boolean;
    isTfaSetupCompleted: boolean;
    emailVerifiedAt: Date | null;
    tourStatus: number;
    timezone: string;
    memo: string | null;
    serviceProviders: unknown | null;
    createdAt?: Date;
    updatedAt?: Date;
}

interface UserCreationAttributes
    extends Optional<
        UserAttributes,
        | "id"
        | "merchantId"
        | "title"
        | "firstName"
        | "middleName"
        | "lastName"
        | "mobileCountryCode"
        | "mobile"
        | "gender"
        | "dob"
        | "userRole"
        | "onboardingStep"
        | "idVerification"
        | "enableSender"
        | "isTfaEnabled"
        | "isTfaSetupCompleted"
        | "emailVerifiedAt"
        | "tourStatus"
        | "timezone"
        | "memo"
        | "serviceProviders"
    > {}

class User
    extends Model<UserAttributes, UserCreationAttributes>
    implements UserAttributes
{
    public id!: number;
    public uniqueId!: string;
    public merchantId!: number | null;
    public title!: string | null;
    public firstName!: string | null;
    public middleName!: string | null;
    public lastName!: string | null;
    public email!: string;
    public password!: string;
    public mobileCountryCode!: string | null;
    public mobile!: string | null;
    public gender!: string | null;
    public dob!: Date | null;
    public userType!: number;
    public userRole!: number;
    public onboardingStep!: number;
    public idVerification!: number;
    public enableSender!: number;
    public isTfaEnabled!: boolean;
    public isTfaSetupCompleted!: boolean;
    public emailVerifiedAt!: Date | null;
    public tourStatus!: number;
    public timezone!: string;
    public memo!: string | null;
    public serviceProviders!: unknown | null;

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
        merchantId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        title: {
            type: DataTypes.STRING(5),
            allowNull: true,
        },
        firstName: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        middleName: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        lastName: {
            type: DataTypes.STRING(100),
            allowNull: true,
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
        gender: {
            type: DataTypes.STRING(5),
            allowNull: true,
        },
        dob: {
            type: DataTypes.DATEONLY,
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
        onboardingStep: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
        idVerification: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
        enableSender: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0,
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
        tourStatus: {
            type: DataTypes.TINYINT.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        timezone: {
            type: DataTypes.STRING(30),
            allowNull: false,
            defaultValue: "Asia/Kolkata",
        },
        memo: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        serviceProviders: {
            type: DataTypes.JSON,
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
