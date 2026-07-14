import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * KYC / onboarding information row, one per user. Mirror of the legacy
 * `user_informations` table. Personal users fill the address/ID fields;
 * business users additionally fill the legal_name / business_* fields.
 */

interface UserInformationAttributes {
    id: number;
    uniqueId: string;
    userId: number;
    country: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    purposeOfTransactions: string | null;
    businessVerificationType: string | null;
    idType: string | null;
    idNumber: string | null;
    profession: string | null;
    sourceOfIncome: string | null;
    legalName: string | null;
    taxId: string | null;
    formationDate: Date | null;
    countryOfIncorporation: string | null;
    businessName: string | null;
    website: string | null;
    typeOfBusiness: string | null;
    ipAddress: string | null;
    role: string | null;
    businessPersons: unknown | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface UserInformationCreationAttributes
    extends Optional<
        UserInformationAttributes,
        | "id"
        | "country"
        | "address1"
        | "address2"
        | "city"
        | "state"
        | "postalCode"
        | "purposeOfTransactions"
        | "businessVerificationType"
        | "idType"
        | "idNumber"
        | "profession"
        | "sourceOfIncome"
        | "legalName"
        | "taxId"
        | "formationDate"
        | "countryOfIncorporation"
        | "businessName"
        | "website"
        | "typeOfBusiness"
        | "ipAddress"
        | "role"
        | "businessPersons"
    > {}

class UserInformation
    extends Model<UserInformationAttributes, UserInformationCreationAttributes>
    implements UserInformationAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number;
    public country!: string | null;
    public address1!: string | null;
    public address2!: string | null;
    public city!: string | null;
    public state!: string | null;
    public postalCode!: string | null;
    public purposeOfTransactions!: string | null;
    public businessVerificationType!: string | null;
    public idType!: string | null;
    public idNumber!: string | null;
    public profession!: string | null;
    public sourceOfIncome!: string | null;
    public legalName!: string | null;
    public taxId!: string | null;
    public formationDate!: Date | null;
    public countryOfIncorporation!: string | null;
    public businessName!: string | null;
    public website!: string | null;
    public typeOfBusiness!: string | null;
    public ipAddress!: string | null;
    public role!: string | null;
    public businessPersons!: unknown | null;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

UserInformation.init(
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
            allowNull: false,
        },
        country: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        address1: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "address_1",
        },
        address2: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "address_2",
        },
        city: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        state: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        postalCode: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        purposeOfTransactions: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        businessVerificationType: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        idType: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        idNumber: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        profession: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        sourceOfIncome: {
            type: DataTypes.STRING(11),
            allowNull: true,
        },
        legalName: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        taxId: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        formationDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        countryOfIncorporation: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "country_of_incorporation",
        },
        businessName: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        website: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        typeOfBusiness: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "type_of_business",
        },
        ipAddress: {
            type: DataTypes.STRING(45),
            allowNull: true,
        },
        role: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        businessPersons: {
            type: DataTypes.JSON,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: "user_informations",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        indexes: [
            {
                fields: ["user_id"],
                name: "user_informations_user_id_foreign",
            },
        ],
    },
);

export default UserInformation;
