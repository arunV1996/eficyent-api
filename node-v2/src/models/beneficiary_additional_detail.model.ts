import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Recipient + bank address block for a beneficiary account. Mirror of
 * the legacy `beneficiary_additional_details` table.
 */

interface BeneficiaryAdditionalDetailAttributes {
    id: number;
    uniqueId: string;
    beneficiaryAccountId: number;
    addressType: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    postalCode: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    paymentType: string | null;
    bankAddressLine1: string | null;
    bankAddressLine2: string | null;
    bankPostalCode: string | null;
    bankCity: string | null;
    bankState: string | null;
    bankCountry: string | null;
    userSourceOfIncome: string | null;
    purposeOfTransaction: string | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
}

type NullableDetailFields = Exclude<
    keyof BeneficiaryAdditionalDetailAttributes,
    "id" | "uniqueId" | "beneficiaryAccountId"
>;

interface BeneficiaryAdditionalDetailCreationAttributes
    extends Optional<
        BeneficiaryAdditionalDetailAttributes,
        "id" | NullableDetailFields
    > {}

class BeneficiaryAdditionalDetail
    extends Model<
        BeneficiaryAdditionalDetailAttributes,
        BeneficiaryAdditionalDetailCreationAttributes
    >
    implements BeneficiaryAdditionalDetailAttributes
{
    public id!: number;
    public uniqueId!: string;
    public beneficiaryAccountId!: number;
    public addressType!: string | null;
    public addressLine1!: string | null;
    public addressLine2!: string | null;
    public postalCode!: string | null;
    public city!: string | null;
    public state!: string | null;
    public country!: string | null;
    public paymentType!: string | null;
    public bankAddressLine1!: string | null;
    public bankAddressLine2!: string | null;
    public bankPostalCode!: string | null;
    public bankCity!: string | null;
    public bankState!: string | null;
    public bankCountry!: string | null;
    public userSourceOfIncome!: string | null;
    public purposeOfTransaction!: string | null;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
    public readonly deletedAt!: Date | null;
}

BeneficiaryAdditionalDetail.init(
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
        beneficiaryAccountId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },
        addressType: { type: DataTypes.STRING(255), allowNull: true },
        addressLine1: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "address_line1",
        },
        addressLine2: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "address_line2",
        },
        postalCode: { type: DataTypes.STRING(20), allowNull: true },
        city: { type: DataTypes.STRING(255), allowNull: true },
        state: { type: DataTypes.STRING(255), allowNull: true },
        country: { type: DataTypes.STRING(3), allowNull: true },
        paymentType: { type: DataTypes.STRING(255), allowNull: true },
        bankAddressLine1: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "bank_address_line1",
        },
        bankAddressLine2: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "bank_address_line2",
        },
        bankPostalCode: { type: DataTypes.STRING(20), allowNull: true },
        bankCity: { type: DataTypes.STRING(255), allowNull: true },
        bankState: { type: DataTypes.STRING(255), allowNull: true },
        bankCountry: { type: DataTypes.STRING(3), allowNull: true },
        userSourceOfIncome: { type: DataTypes.STRING(255), allowNull: true },
        purposeOfTransaction: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
        sequelize,
        tableName: "beneficiary_additional_details",
        underscored: true,
        timestamps: true,
        paranoid: true,
        indexes: [
            {
                fields: ["beneficiary_account_id"],
                name: "beneficiary_additional_details_beneficiary_account_id_foreign",
            },
        ],
    },
);

export default BeneficiaryAdditionalDetail;
