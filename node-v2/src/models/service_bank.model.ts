import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Provider-specific bank directory (used for the service-bank dropdown
 * in beneficiary forms). Mirror of the legacy `service_banks` table.
 * Note: `status` is a VARCHAR in the legacy schema, not a tinyint.
 */

interface ServiceBankAttributes {
    id: number;
    uniqueId: string;
    bankId: string;
    bankName: string;
    isoCode: string | null;
    country: string;
    currency: string | null;
    serviceType: string | null;
    externalType: string | null;
    status: string;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
}

interface ServiceBankCreationAttributes
    extends Optional<
        ServiceBankAttributes,
        "id" | "isoCode" | "currency" | "serviceType" | "externalType" | "status"
    > {}

class ServiceBank
    extends Model<ServiceBankAttributes, ServiceBankCreationAttributes>
    implements ServiceBankAttributes
{
    public id!: number;
    public uniqueId!: string;
    public bankId!: string;
    public bankName!: string;
    public isoCode!: string | null;
    public country!: string;
    public currency!: string | null;
    public serviceType!: string | null;
    public externalType!: string | null;
    public status!: string;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
    public readonly deletedAt!: Date | null;
}

ServiceBank.init(
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
        bankId: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },
        bankName: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        isoCode: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        country: {
            type: DataTypes.STRING(3),
            allowNull: false,
        },
        currency: {
            type: DataTypes.STRING(10),
            allowNull: true,
        },
        serviceType: {
            type: DataTypes.STRING(3),
            allowNull: true,
        },
        externalType: {
            type: DataTypes.STRING(11),
            allowNull: true,
        },
        status: {
            type: DataTypes.STRING(255),
            allowNull: false,
            defaultValue: "1",
        },
    },
    {
        sequelize,
        tableName: "service_banks",
        underscored: true,
        timestamps: true,
        paranoid: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        deletedAt: "deleted_at",
    },
);

export default ServiceBank;
