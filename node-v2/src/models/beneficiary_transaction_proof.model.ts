import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import BeneficiaryTransaction from "./beneficiary_transaction.model";

/**
 * Payment-proof request (FIRA / SWIFT copy) attached to a beneficiary
 * transaction. Mirror of the legacy `beneficiary_transaction_proofs`
 * table.
 */

interface BeneficiaryTransactionProofAttributes {
    id: number;
    uniqueId: string;
    beneficiaryTransactionId: number;
    documentType: string;
    remitterProof: string | null;
    status: number;
    fileUrl: string | null;
    requestedAt: Date | null;
    uploadedAt: Date | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

type OptionalProofFields = Exclude<
    keyof BeneficiaryTransactionProofAttributes,
    "id" | "uniqueId" | "beneficiaryTransactionId" | "documentType"
>;

interface BeneficiaryTransactionProofCreationAttributes
    extends Optional<
        BeneficiaryTransactionProofAttributes,
        "id" | OptionalProofFields
    > {}

class BeneficiaryTransactionProof
    extends Model<
        BeneficiaryTransactionProofAttributes,
        BeneficiaryTransactionProofCreationAttributes
    >
    implements BeneficiaryTransactionProofAttributes
{
    public id!: number;
    public uniqueId!: string;
    public beneficiaryTransactionId!: number;
    public documentType!: string;
    public remitterProof!: string | null;
    public status!: number;
    public fileUrl!: string | null;
    public requestedAt!: Date | null;
    public uploadedAt!: Date | null;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;

    public readonly transaction?: BeneficiaryTransaction;
}

BeneficiaryTransactionProof.init(
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
        beneficiaryTransactionId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },
        documentType: { type: DataTypes.STRING(255), allowNull: false },
        remitterProof: { type: DataTypes.TEXT, allowNull: true },
        status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
        fileUrl: { type: DataTypes.TEXT, allowNull: true },
        requestedAt: { type: DataTypes.DATE, allowNull: true },
        uploadedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
        sequelize,
        tableName: "beneficiary_transaction_proofs",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

BeneficiaryTransaction.hasMany(BeneficiaryTransactionProof, {
    foreignKey: "beneficiaryTransactionId",
    as: "proofs",
});
BeneficiaryTransactionProof.belongsTo(BeneficiaryTransaction, {
    foreignKey: "beneficiaryTransactionId",
    as: "transaction",
});

export default BeneficiaryTransactionProof;
