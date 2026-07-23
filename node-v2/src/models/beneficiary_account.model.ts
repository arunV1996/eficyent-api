import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import BeneficiaryAdditionalDetail from "./beneficiary_additional_detail.model";

/**
 * Payout recipient account. Mirror of the legacy `beneficiary_accounts`
 * table (soft-deleted via deleted_at).
 */

interface BeneficiaryAccountAttributes {
    id: number;
    uniqueId: string;
    userId: number | null;
    teamMemberId: number | null;
    currency: string;
    country: string;
    type: number | null;
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
    email: string | null;
    mobileCountryCode: string | null;
    mobile: string | null;
    paymentRail: string | null;
    serviceBank: string | null;
    bankName: string | null;
    routingNumber: string | null;
    accountName: string | null;
    accountNumber: string | null;
    accountType: string | null;
    swiftCode: string | null;
    iban: string | null;
    idNumber: string | null;
    intermediaryBankSwiftCode: string | null;
    intermediaryBankName: string | null;
    intermediaryBankAba: string | null;
    intermediaryBankAddress: string | null;
    intermediaryBankCity: string | null;
    intermediaryBankState: string | null;
    intermediaryBankPostalCode: string | null;
    intermediaryBankCountry: string | null;
    bankCountry: string | null;
    businessName: string | null;
    businessCountry: string | null;
    externalType: string | null;
    externalReferenceId: string | null;
    externalData: unknown | null;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
}

type NullableFields = Exclude<
    keyof BeneficiaryAccountAttributes,
    "id" | "uniqueId" | "currency" | "country" | "status"
>;

interface BeneficiaryAccountCreationAttributes
    extends Optional<
        BeneficiaryAccountAttributes,
        "id" | "currency" | "country" | "status" | NullableFields
    > {}

class BeneficiaryAccount
    extends Model<
        BeneficiaryAccountAttributes,
        BeneficiaryAccountCreationAttributes
    >
    implements BeneficiaryAccountAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number | null;
    public teamMemberId!: number | null;
    public currency!: string;
    public country!: string;
    public type!: number | null;
    public firstName!: string | null;
    public middleName!: string | null;
    public lastName!: string | null;
    public email!: string | null;
    public mobileCountryCode!: string | null;
    public mobile!: string | null;
    public paymentRail!: string | null;
    public serviceBank!: string | null;
    public bankName!: string | null;
    public routingNumber!: string | null;
    public accountName!: string | null;
    public accountNumber!: string | null;
    public accountType!: string | null;
    public swiftCode!: string | null;
    public iban!: string | null;
    public idNumber!: string | null;
    public intermediaryBankSwiftCode!: string | null;
    public intermediaryBankName!: string | null;
    public intermediaryBankAba!: string | null;
    public intermediaryBankAddress!: string | null;
    public intermediaryBankCity!: string | null;
    public intermediaryBankState!: string | null;
    public intermediaryBankPostalCode!: string | null;
    public intermediaryBankCountry!: string | null;
    public bankCountry!: string | null;
    public businessName!: string | null;
    public businessCountry!: string | null;
    public externalType!: string | null;
    public externalReferenceId!: string | null;
    public externalData!: unknown | null;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
    public readonly deletedAt!: Date | null;

    public additionalDetails?: BeneficiaryAdditionalDetail[];
}

BeneficiaryAccount.init(
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
        userId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        teamMemberId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            field: "team_member_id",
        },
        currency: {
            type: DataTypes.STRING(3),
            allowNull: false,
            defaultValue: "USD",
        },
        country: {
            type: DataTypes.STRING(4),
            allowNull: false,
            defaultValue: "US",
        },
        type: {
            type: DataTypes.TINYINT,
            allowNull: true,
            defaultValue: 1,
        },
        firstName: { type: DataTypes.STRING(255), allowNull: true },
        middleName: { type: DataTypes.STRING(255), allowNull: true },
        lastName: { type: DataTypes.STRING(255), allowNull: true },
        email: { type: DataTypes.STRING(255), allowNull: true },
        mobileCountryCode: { type: DataTypes.STRING(255), allowNull: true },
        mobile: { type: DataTypes.STRING(255), allowNull: true },
        paymentRail: { type: DataTypes.STRING(255), allowNull: true },
        serviceBank: { type: DataTypes.STRING(255), allowNull: true },
        bankName: { type: DataTypes.STRING(255), allowNull: true },
        routingNumber: { type: DataTypes.STRING(255), allowNull: true },
        accountName: { type: DataTypes.STRING(255), allowNull: true },
        accountNumber: { type: DataTypes.STRING(255), allowNull: true },
        accountType: { type: DataTypes.STRING(255), allowNull: true },
        swiftCode: { type: DataTypes.STRING(255), allowNull: true },
        iban: { type: DataTypes.STRING(255), allowNull: true },
        idNumber: { type: DataTypes.STRING(255), allowNull: true },
        intermediaryBankSwiftCode: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        intermediaryBankName: { type: DataTypes.STRING(255), allowNull: true },
        intermediaryBankAba: { type: DataTypes.STRING(255), allowNull: true },
        intermediaryBankAddress: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        intermediaryBankCity: { type: DataTypes.STRING(255), allowNull: true },
        intermediaryBankState: { type: DataTypes.STRING(255), allowNull: true },
        intermediaryBankPostalCode: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        intermediaryBankCountry: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        bankCountry: { type: DataTypes.STRING(3), allowNull: true },
        businessName: { type: DataTypes.STRING(255), allowNull: true },
        businessCountry: { type: DataTypes.STRING(3), allowNull: true },
        externalType: { type: DataTypes.STRING(255), allowNull: true },
        externalReferenceId: { type: DataTypes.STRING(255), allowNull: true },
        externalData: { type: DataTypes.JSON, allowNull: true },
        status: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0,
        },
    },
    {
        sequelize,
        tableName: "beneficiary_accounts",
        underscored: true,
        timestamps: true,
        paranoid: true,
        indexes: [
            {
                fields: ["user_id"],
                name: "beneficiary_accounts_user_id_foreign",
            },
        ],
    },
);

BeneficiaryAccount.hasMany(BeneficiaryAdditionalDetail, {
    foreignKey: "beneficiaryAccountId",
    as: "additionalDetails",
});
BeneficiaryAdditionalDetail.belongsTo(BeneficiaryAccount, {
    foreignKey: "beneficiaryAccountId",
    as: "beneficiaryAccount",
});

export default BeneficiaryAccount;
