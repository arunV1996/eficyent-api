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
    businessUserId: number | null;
    complianceMerchantId: string | null;
    title: string | null;
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
    email: string;
    password: string;
    picture: string;
    browserId: string | null;
    rememberToken: string | null;
    mobileCountryCode: string | null;
    mobile: string | null;
    gender: string | null;
    dob: Date | null;
    userType: number;
    userRole: number | null;
    onboardingStep: number;
    idVerification: number;
    idVerifiedBy: string | null;
    idVerificationData: unknown | null;
    deletedAt: Date | null;
    enableSender: number;
    isTfaEnabled: boolean;
    isTfaSetupCompleted: boolean;
    emailVerifiedAt: Date | null;
    tourStatus: number;
    timezone: string;
    memo: string | null;
    serviceProviders: unknown | null;
    emailCode: string | null;
    emailCodeExpiry: string | null;
    tfaSecret: string | null;
    backupCodes: string | null;
    apiKey: string | null;
    saltKey: string | null;
    privateKey: string | null;
    publicKey: string | null;
    deviceType: string | null;
    deviceToken: string | null;
    createdAt?: Date;
    updatedAt?: Date;
}

interface UserCreationAttributes
    extends Optional<
        UserAttributes,
        | "id"
        | "merchantId"
        | "businessUserId"
        | "complianceMerchantId"
        | "title"
        | "firstName"
        | "middleName"
        | "lastName"
        | "picture"
        | "browserId"
        | "rememberToken"
        | "mobileCountryCode"
        | "mobile"
        | "gender"
        | "dob"
        | "userRole"
        | "onboardingStep"
        | "idVerification"
        | "idVerifiedBy"
        | "idVerificationData"
        | "deletedAt"
        | "enableSender"
        | "isTfaEnabled"
        | "isTfaSetupCompleted"
        | "emailVerifiedAt"
        | "tourStatus"
        | "timezone"
        | "memo"
        | "serviceProviders"
        | "emailCode"
        | "emailCodeExpiry"
        | "tfaSecret"
        | "backupCodes"
        | "apiKey"
        | "saltKey"
        | "privateKey"
        | "publicKey"
        | "deviceType"
        | "deviceToken"
    > {}

class User
    extends Model<UserAttributes, UserCreationAttributes>
    implements UserAttributes
{
    public id!: number;
    public uniqueId!: string;
    public merchantId!: number | null;
    public businessUserId!: number | null;
    public complianceMerchantId!: string | null;
    public title!: string | null;
    public firstName!: string | null;
    public middleName!: string | null;
    public lastName!: string | null;
    public email!: string;
    public password!: string;
    public picture!: string;
    public browserId!: string | null;
    public rememberToken!: string | null;
    public mobileCountryCode!: string | null;
    public mobile!: string | null;
    public gender!: string | null;
    public dob!: Date | null;
    public userType!: number;
    public userRole!: number | null;
    public onboardingStep!: number;
    public idVerification!: number;
    public idVerifiedBy!: string | null;
    public idVerificationData!: unknown | null;
    // NOTE: intentionally NOT `paranoid` — the legacy Prisma service
    // never auto-filtered deleted_at, so queries must see soft-deleted
    // rows exactly like legacy. delete-account sets this manually.
    public deletedAt!: Date | null;
    public enableSender!: number;
    public isTfaEnabled!: boolean;
    public isTfaSetupCompleted!: boolean;
    public emailVerifiedAt!: Date | null;
    public tourStatus!: number;
    public timezone!: string;
    public memo!: string | null;
    public serviceProviders!: unknown | null;
    public emailCode!: string | null;
    public emailCodeExpiry!: string | null;
    public tfaSecret!: string | null;
    public backupCodes!: string | null;
    public apiKey!: string | null;
    public saltKey!: string | null;
    public privateKey!: string | null;
    public publicKey!: string | null;
    public deviceType!: string | null;
    public deviceToken!: string | null;

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
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },
        merchantId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        businessUserId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        complianceMerchantId: {
            type: DataTypes.STRING(255),
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
        picture: {
            type: DataTypes.STRING(255),
            allowNull: false,
            defaultValue: "/placeholders/placeholder.png",
            // Stored as a relative path; the app origin is prepended
            // at read time so the URL follows APP_URL per environment.
            get(this: User): string {
                const raw = this.getDataValue("picture");
                if (!raw || /^https?:\/\//.test(raw)) {
                    return raw;
                }
                return `${process.env.APP_URL ?? ""}${raw}`;
            },
        },
        browserId: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        rememberToken: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        mobileCountryCode: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        mobile: {
            type: DataTypes.STRING(255),
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
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0,
        },
        userRole: {
            type: DataTypes.TINYINT,
            allowNull: true,
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
        idVerifiedBy: { type: DataTypes.STRING(255), allowNull: true },
        idVerificationData: { type: DataTypes.JSON, allowNull: true },
        deletedAt: { type: DataTypes.DATE, allowNull: true },
        enableSender: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0,
        },
        isTfaEnabled: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: false,
        },
        isTfaSetupCompleted: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: false,
        },
        emailVerifiedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        tourStatus: {
            type: DataTypes.TINYINT,
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
        emailCode: { type: DataTypes.STRING(255), allowNull: true },
        emailCodeExpiry: { type: DataTypes.STRING(255), allowNull: true },
        tfaSecret: { type: DataTypes.TEXT, allowNull: true },
        backupCodes: { type: DataTypes.TEXT, allowNull: true },
        apiKey: { type: DataTypes.TEXT, allowNull: true },
        saltKey: { type: DataTypes.TEXT, allowNull: true },
        privateKey: { type: DataTypes.TEXT, allowNull: true },
        publicKey: { type: DataTypes.TEXT, allowNull: true },
        deviceType: { type: DataTypes.STRING(255), allowNull: true },
        deviceToken: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
        sequelize,
        tableName: "users",
        underscored: true,
        timestamps: true,
        defaultScope: {
            attributes: {
                exclude: ["password", "tfaSecret", "backupCodes", "saltKey", "privateKey", "emailCode"],
            },
        },
        scopes: {
            withPassword: {
                attributes: { include: ["password"] },
            },
            // Full row including credential/2FA secrets — use only in
            // auth flows that verify them.
            withSecrets: {
                attributes: { include: [] },
            },
        },
    },
);

export default User;
