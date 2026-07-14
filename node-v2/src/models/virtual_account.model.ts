import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Provider-issued virtual bank account (funding source for payouts).
 * Mirror of the legacy `virtual_accounts` table. user_id is nullable —
 * NULL rows are global/shared accounts.
 */

interface VirtualAccountAttributes {
    id: number;
    uniqueId: string;
    userId: number | null;
    country: string;
    currency: string;
    accountNumber: string | null;
    accountHolderName: string | null;
    accountHolderAddress: string | null;
    accountBankName: string | null;
    accountBankCode: string | null;
    accountBankAddress: string | null;
    routingNumber: string | null;
    externalType: string | null;
    externalReferenceId: string | null;
    externalData: unknown | null;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

type OptionalVirtualAccountFields = Exclude<
    keyof VirtualAccountAttributes,
    "id" | "uniqueId"
>;

interface VirtualAccountCreationAttributes
    extends Optional<
        VirtualAccountAttributes,
        "id" | OptionalVirtualAccountFields
    > {}

class VirtualAccount
    extends Model<VirtualAccountAttributes, VirtualAccountCreationAttributes>
    implements VirtualAccountAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number | null;
    public country!: string;
    public currency!: string;
    public accountNumber!: string | null;
    public accountHolderName!: string | null;
    public accountHolderAddress!: string | null;
    public accountBankName!: string | null;
    public accountBankCode!: string | null;
    public accountBankAddress!: string | null;
    public routingNumber!: string | null;
    public externalType!: string | null;
    public externalReferenceId!: string | null;
    public externalData!: unknown | null;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

VirtualAccount.init(
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
        country: {
            type: DataTypes.STRING(100),
            allowNull: false,
            defaultValue: "US",
        },
        currency: {
            type: DataTypes.STRING(100),
            allowNull: false,
            defaultValue: "USD",
        },
        accountNumber: { type: DataTypes.STRING(255), allowNull: true },
        accountHolderName: { type: DataTypes.STRING(255), allowNull: true },
        accountHolderAddress: { type: DataTypes.STRING(255), allowNull: true },
        accountBankName: { type: DataTypes.STRING(255), allowNull: true },
        accountBankCode: { type: DataTypes.STRING(255), allowNull: true },
        accountBankAddress: { type: DataTypes.STRING(255), allowNull: true },
        routingNumber: { type: DataTypes.STRING(255), allowNull: true },
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
        tableName: "virtual_accounts",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        indexes: [
            {
                fields: ["user_id"],
                name: "virtual_accounts_user_id_foreign",
            },
        ],
    },
);

export default VirtualAccount;
