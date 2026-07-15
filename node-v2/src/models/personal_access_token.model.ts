import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Sanctum-style personal access token row. Stores the SHA-256
 * fingerprint of the plaintext token in `token`; the plaintext is
 * returned to the client only once at issue time.
 *
 * `abilities` is stored as a JSON array of scope strings.
 */

interface PersonalAccessTokenAttributes {
    id: number;
    tokenableType: string;
    tokenableId: number;
    name: string;
    token: string;
    abilities: string | null;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
}

interface PersonalAccessTokenCreationAttributes
    extends Optional<
        PersonalAccessTokenAttributes,
        "id" | "abilities" | "lastUsedAt" | "expiresAt"
    > {}

class PersonalAccessToken
    extends Model<
        PersonalAccessTokenAttributes,
        PersonalAccessTokenCreationAttributes
    >
    implements PersonalAccessTokenAttributes
{
    public id!: number;
    public tokenableType!: string;
    public tokenableId!: number;
    public name!: string;
    public token!: string;
    public abilities!: string | null;
    public lastUsedAt!: Date | null;
    public expiresAt!: Date | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

PersonalAccessToken.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        tokenableType: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        tokenableId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        token: {
            type: DataTypes.STRING(64),
            allowNull: false,
            unique: true,
        },
        abilities: {
            // Legacy stores a JSON-stringified array in a TEXT column.
            type: DataTypes.TEXT,
            allowNull: true,
        },
        lastUsedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: "personal_access_tokens",
        underscored: true,
        timestamps: true,
        indexes: [
            {
                fields: ["tokenable_type", "tokenable_id"],
                name: "personal_access_tokens_tokenable_type_tokenable_id_index",
            },
        ],
    },
);

export default PersonalAccessToken;
