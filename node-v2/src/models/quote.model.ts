import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import VirtualAccount from "./virtual_account.model";

/**
 * FX quote row (mirror of the legacy `quotes` table). Money columns
 * are DECIMAL and surface as strings from MySQL — keep them strings
 * to avoid float precision loss.
 */

interface QuoteAttributes {
    id: number;
    uniqueId: string;
    userId: number;
    beneficiaryAccountId: number | null;
    virtualAccountId: number | null;
    sourceId: number | null;
    sourceType: string | null;
    amount: string;
    totalSendingAmount: string | null;
    commissionType: number | null;
    commissionValue: string;
    commissionAmount: string;
    merchantCommissionAmount: string | null;
    externalCommissionAmount: string;
    receivingAmount: string;
    fxRate: string | null;
    internalFxRate: string | null;
    externalFxRate: string | null;
    quoteType: string;
    recipientType: number;
    recipientCountry: string | null;
    receivingCurrency: string | null;
    paymentRail: string | null;
    status: number;
    externalType: string;
    externalReferenceId: string | null;
    externalData: unknown | null;
    expiresAt: Date | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

type OptionalQuoteFields = Exclude<
    keyof QuoteAttributes,
    "id" | "uniqueId" | "userId" | "quoteType" | "recipientType"
>;

interface QuoteCreationAttributes
    extends Optional<
        QuoteAttributes,
        "id" | "quoteType" | "recipientType" | OptionalQuoteFields
    > {}

class Quote
    extends Model<QuoteAttributes, QuoteCreationAttributes>
    implements QuoteAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number;
    public beneficiaryAccountId!: number | null;
    public virtualAccountId!: number | null;
    public sourceId!: number | null;
    public sourceType!: string | null;
    public amount!: string;
    public totalSendingAmount!: string | null;
    public commissionType!: number | null;
    public commissionValue!: string;
    public commissionAmount!: string;
    public merchantCommissionAmount!: string | null;
    public externalCommissionAmount!: string;
    public receivingAmount!: string;
    public fxRate!: string | null;
    public internalFxRate!: string | null;
    public externalFxRate!: string | null;
    public quoteType!: string;
    public recipientType!: number;
    public recipientCountry!: string | null;
    public receivingCurrency!: string | null;
    public paymentRail!: string | null;
    public status!: number;
    public externalType!: string;
    public externalReferenceId!: string | null;
    public externalData!: unknown | null;
    public expiresAt!: Date | null;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;

    // Eager-loaded association (alias mirrors the legacy Prisma
    // include name).
    public readonly virtual_accounts?: VirtualAccount;
}

Quote.init(
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
        beneficiaryAccountId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        virtualAccountId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        sourceId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        sourceType: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0,
        },
        totalSendingAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true,
        },
        commissionType: {
            type: DataTypes.TINYINT,
            allowNull: true,
        },
        commissionValue: {
            type: DataTypes.DECIMAL(8, 2),
            allowNull: false,
            defaultValue: 0,
        },
        commissionAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0,
        },
        merchantCommissionAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true,
        },
        externalCommissionAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0,
        },
        receivingAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0,
        },
        fxRate: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        internalFxRate: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        externalFxRate: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        quoteType: {
            type: DataTypes.STRING(255),
            allowNull: false,
            defaultValue: "FORWARD",
        },
        recipientType: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
        recipientCountry: {
            type: DataTypes.STRING(10),
            allowNull: true,
        },
        receivingCurrency: {
            type: DataTypes.STRING(5),
            allowNull: true,
        },
        paymentRail: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        status: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0,
        },
        externalType: {
            type: DataTypes.STRING(255),
            allowNull: false,
            defaultValue: "ec",
        },
        externalReferenceId: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        externalData: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: "quotes",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        indexes: [
            { fields: ["expires_at"], name: "quotes_expires_at_index" },
            {
                fields: ["user_id", "status"],
                name: "quotes_user_id_status_index",
            },
        ],
    },
);

// Alias mirrors the legacy Prisma include name (quote.virtual_accounts).
Quote.belongsTo(VirtualAccount, {
    foreignKey: "virtualAccountId",
    as: "virtual_accounts",
});

export default Quote;
