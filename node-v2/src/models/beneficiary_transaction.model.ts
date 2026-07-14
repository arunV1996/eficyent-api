import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import BeneficiaryAccount from "./beneficiary_account.model";
import Quote from "./quote.model";
import Sender from "./sender.model";
import TeamMember from "./team_member.model";
import User from "./user.model";
import type BeneficiaryTransactionProof from "./beneficiary_transaction_proof.model";

/**
 * Payout transaction row. Mirror of the legacy
 * `beneficiary_transactions` table. Money columns are DECIMAL(20,6)
 * and stay strings.
 */

interface BeneficiaryTransactionAttributes {
    id: number;
    uniqueId: string;
    txnRefNo: string | null;
    orderId: string | null;
    userId: number;
    teamMemberId: number | null;
    senderId: number | null;
    beneficiaryAccountId: number | null;
    quoteId: number | null;
    virtualAccountId: number | null;
    amount: string;
    totalAmount: string;
    commissionAmount: string;
    recipientAmount: string | null;
    receivingCurrency: string | null;
    paymentRail: string | null;
    rail: string | null;
    externalType: string | null;
    serviceMid: string | null;
    externalReferenceId: string | null;
    externalData: unknown | null;
    purposeOfPayment: string | null;
    supportingDocument: string | null;
    clientReferenceId: string | null;
    remarks: string | null;
    notes: string | null;
    complianceData: unknown | null;
    complianceStatus: number;
    complianceNotes: string | null;
    remittanceData: unknown | null;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

type OptionalBtFields = Exclude<
    keyof BeneficiaryTransactionAttributes,
    "id" | "uniqueId" | "userId" | "amount" | "totalAmount"
>;

interface BeneficiaryTransactionCreationAttributes
    extends Optional<BeneficiaryTransactionAttributes, "id" | OptionalBtFields> {}

class BeneficiaryTransaction
    extends Model<
        BeneficiaryTransactionAttributes,
        BeneficiaryTransactionCreationAttributes
    >
    implements BeneficiaryTransactionAttributes
{
    public id!: number;
    public uniqueId!: string;
    public txnRefNo!: string | null;
    public orderId!: string | null;
    public userId!: number;
    public teamMemberId!: number | null;
    public senderId!: number | null;
    public beneficiaryAccountId!: number | null;
    public quoteId!: number | null;
    public virtualAccountId!: number | null;
    public amount!: string;
    public totalAmount!: string;
    public commissionAmount!: string;
    public recipientAmount!: string | null;
    public receivingCurrency!: string | null;
    public paymentRail!: string | null;
    public rail!: string | null;
    public externalType!: string | null;
    public serviceMid!: string | null;
    public externalReferenceId!: string | null;
    public externalData!: unknown | null;
    public purposeOfPayment!: string | null;
    public supportingDocument!: string | null;
    public clientReferenceId!: string | null;
    public remarks!: string | null;
    public notes!: string | null;
    public complianceData!: unknown | null;
    public complianceStatus!: number;
    public complianceNotes!: string | null;
    public remittanceData!: unknown | null;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;

    // Eager-loaded associations (aliases mirror the legacy Prisma
    // include names so the resource shaper reads identically).
    public readonly beneficiaryAccount?: BeneficiaryAccount;
    public readonly quotes?: Quote;
    public readonly senders?: Sender;
    public readonly team_members?: TeamMember;
    public readonly users?: User;
    public readonly proofs?: BeneficiaryTransactionProof[];
}

BeneficiaryTransaction.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        uniqueId: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        txnRefNo: { type: DataTypes.STRING(255), allowNull: true, unique: true },
        orderId: { type: DataTypes.STRING(255), allowNull: true },
        userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        teamMemberId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
        senderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
        beneficiaryAccountId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        quoteId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
        virtualAccountId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
        amount: { type: DataTypes.DECIMAL(20, 6), allowNull: false },
        totalAmount: { type: DataTypes.DECIMAL(20, 6), allowNull: false },
        commissionAmount: {
            type: DataTypes.DECIMAL(20, 6),
            allowNull: false,
            defaultValue: 0,
        },
        recipientAmount: { type: DataTypes.DECIMAL(20, 6), allowNull: true },
        receivingCurrency: { type: DataTypes.STRING(5), allowNull: true },
        paymentRail: { type: DataTypes.STRING(255), allowNull: true },
        rail: { type: DataTypes.STRING(255), allowNull: true },
        externalType: { type: DataTypes.STRING(255), allowNull: true },
        serviceMid: { type: DataTypes.STRING(255), allowNull: true },
        externalReferenceId: { type: DataTypes.STRING(255), allowNull: true },
        externalData: { type: DataTypes.JSON, allowNull: true },
        purposeOfPayment: { type: DataTypes.STRING(255), allowNull: true },
        supportingDocument: { type: DataTypes.STRING(255), allowNull: true },
        clientReferenceId: { type: DataTypes.STRING(255), allowNull: true },
        remarks: { type: DataTypes.TEXT, allowNull: true },
        notes: { type: DataTypes.TEXT, allowNull: true },
        complianceData: { type: DataTypes.JSON, allowNull: true },
        complianceStatus: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        complianceNotes: { type: DataTypes.STRING(255), allowNull: true },
        remittanceData: { type: DataTypes.JSON, allowNull: true },
        status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
        sequelize,
        tableName: "beneficiary_transactions",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

BeneficiaryTransaction.belongsTo(BeneficiaryAccount, {
    foreignKey: "beneficiaryAccountId",
    as: "beneficiaryAccount",
});
BeneficiaryTransaction.belongsTo(Quote, {
    foreignKey: "quoteId",
    as: "quotes",
});
BeneficiaryTransaction.belongsTo(Sender, {
    foreignKey: "senderId",
    as: "senders",
});
BeneficiaryTransaction.belongsTo(TeamMember, {
    foreignKey: "teamMemberId",
    as: "team_members",
});
BeneficiaryTransaction.belongsTo(User, {
    foreignKey: "userId",
    as: "users",
});

export default BeneficiaryTransaction;
