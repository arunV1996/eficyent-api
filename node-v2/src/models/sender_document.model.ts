import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import Sender from "./sender.model";

/**
 * KYC document attached to a (business) sender. Mirror of the legacy
 * `sender_documents` table — the transaction resource exposes these as
 * the remitter's `proofs` array.
 */

interface SenderDocumentAttributes {
    id: number;
    uniqueId: string;
    senderId: number;
    documentName: string | null;
    documentType: string | null;
    documentCountry: string | null;
    documentFile: string | null;
    status: number;
    verifiedAt: Date | null;
    remarks: string | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

type OptionalSenderDocumentFields = Exclude<
    keyof SenderDocumentAttributes,
    "id" | "uniqueId" | "senderId"
>;

interface SenderDocumentCreationAttributes
    extends Optional<
        SenderDocumentAttributes,
        "id" | OptionalSenderDocumentFields
    > {}

class SenderDocument
    extends Model<SenderDocumentAttributes, SenderDocumentCreationAttributes>
    implements SenderDocumentAttributes
{
    public id!: number;
    public uniqueId!: string;
    public senderId!: number;
    public documentName!: string | null;
    public documentType!: string | null;
    public documentCountry!: string | null;
    public documentFile!: string | null;
    public status!: number;
    public verifiedAt!: Date | null;
    public remarks!: string | null;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

SenderDocument.init(
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
        senderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        documentName: { type: DataTypes.STRING(100), allowNull: true },
        documentType: { type: DataTypes.STRING(100), allowNull: true },
        documentCountry: { type: DataTypes.STRING(100), allowNull: true },
        documentFile: { type: DataTypes.STRING(255), allowNull: true },
        status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
        verifiedAt: { type: DataTypes.DATE, allowNull: true },
        remarks: { type: DataTypes.TEXT, allowNull: true },
    },
    {
        sequelize,
        tableName: "sender_documents",
        underscored: true,
        timestamps: true,
    },
);

Sender.hasMany(SenderDocument, {
    foreignKey: "senderId",
    as: "documents",
});
SenderDocument.belongsTo(Sender, {
    foreignKey: "senderId",
    as: "sender",
});

export default SenderDocument;
