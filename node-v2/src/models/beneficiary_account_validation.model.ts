import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Cached provider account-validation result, keyed by account_number
 * (unique). Mirror of the legacy `beneficiary_account_validations`
 * table.
 */

interface BeneficiaryAccountValidationAttributes {
    id: number;
    uniqueId: string;
    userId: number;
    accountName: string | null;
    accountNumber: string;
    code: string | null;
    validationService: string | null;
    externalReferenceId: string | null;
    externalStatus: string | null;
    externalData: unknown | null;
    remarks: string | null;
    isAccountExists: number;
    isNreAccount: number;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface BeneficiaryAccountValidationCreationAttributes
    extends Optional<
        BeneficiaryAccountValidationAttributes,
        | "id"
        | "accountName"
        | "code"
        | "validationService"
        | "externalReferenceId"
        | "externalStatus"
        | "externalData"
        | "remarks"
        | "isAccountExists"
        | "isNreAccount"
        | "status"
    > {}

class BeneficiaryAccountValidation
    extends Model<
        BeneficiaryAccountValidationAttributes,
        BeneficiaryAccountValidationCreationAttributes
    >
    implements BeneficiaryAccountValidationAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number;
    public accountName!: string | null;
    public accountNumber!: string;
    public code!: string | null;
    public validationService!: string | null;
    public externalReferenceId!: string | null;
    public externalStatus!: string | null;
    public externalData!: unknown | null;
    public remarks!: string | null;
    public isAccountExists!: number;
    public isNreAccount!: number;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

BeneficiaryAccountValidation.init(
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
        accountName: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        accountNumber: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },
        code: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        validationService: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        externalReferenceId: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        externalStatus: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        externalData: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        isAccountExists: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0,
        },
        isNreAccount: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0,
        },
        status: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0,
        },
    },
    {
        sequelize,
        tableName: "beneficiary_account_validations",
        underscored: true,
        timestamps: true,
        indexes: [
            {
                fields: ["user_id"],
                name: "beneficiary_account_validations_user_id_foreign",
            },
        ],
    },
);

export default BeneficiaryAccountValidation;
