import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Uploaded KYC document row. Mirror of the legacy `user_documents`
 * table. document_file / document_back_file hold S3 keys (or full
 * URLs) that are converted to signed URLs at response time.
 */

interface UserDocumentAttributes {
    id: number;
    uniqueId: string;
    userId: number;
    documentName: string | null;
    documentType: string | null;
    documentCountry: string | null;
    documentFile: string | null;
    documentBackFile: string | null;
    documentExpiryDate: Date | null;
    status: number;
    verifiedAt: Date | null;
    remarks: string | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface UserDocumentCreationAttributes
    extends Optional<
        UserDocumentAttributes,
        | "id"
        | "documentName"
        | "documentType"
        | "documentCountry"
        | "documentFile"
        | "documentBackFile"
        | "documentExpiryDate"
        | "status"
        | "verifiedAt"
        | "remarks"
    > {}

class UserDocument
    extends Model<UserDocumentAttributes, UserDocumentCreationAttributes>
    implements UserDocumentAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number;
    public documentName!: string | null;
    public documentType!: string | null;
    public documentCountry!: string | null;
    public documentFile!: string | null;
    public documentBackFile!: string | null;
    public documentExpiryDate!: Date | null;
    public status!: number;
    public verifiedAt!: Date | null;
    public remarks!: string | null;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

UserDocument.init(
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
        documentName: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        documentType: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        documentCountry: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        documentFile: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        documentBackFile: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        documentExpiryDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        status: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
        verifiedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: "user_documents",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        indexes: [
            {
                fields: ["user_id"],
                name: "user_documents_user_id_foreign",
            },
        ],
    },
);

export default UserDocument;
