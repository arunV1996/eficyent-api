import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Polymorphic fee/commission configuration row (owner is a User,
 * Merchant, or NULL for the global default). Mirror of the legacy
 * `fees` table.
 */

interface FeeAttributes {
    id: number;
    uniqueId: string;
    ownerType: string | null;
    ownerId: number | null;
    feeName: string;
    feeType: string;
    mode: string | null;
    feeValue: string;
    currency1: string | null;
    currency2: string | null;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface FeeCreationAttributes
    extends Optional<
        FeeAttributes,
        | "id"
        | "ownerType"
        | "ownerId"
        | "feeType"
        | "mode"
        | "currency1"
        | "currency2"
        | "status"
    > {}

class Fee
    extends Model<FeeAttributes, FeeCreationAttributes>
    implements FeeAttributes
{
    public id!: number;
    public uniqueId!: string;
    public ownerType!: string | null;
    public ownerId!: number | null;
    public feeName!: string;
    public feeType!: string;
    public mode!: string | null;
    public feeValue!: string;
    public currency1!: string | null;
    public currency2!: string | null;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

Fee.init(
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
        ownerType: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        ownerId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        feeName: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        feeType: {
            type: DataTypes.STRING(255),
            allowNull: false,
            defaultValue: "1",
        },
        mode: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        feeValue: {
            type: DataTypes.DECIMAL(27, 12),
            allowNull: false,
        },
        currency1: {
            type: DataTypes.CHAR(4),
            allowNull: true,
            field: "currency_1",
        },
        currency2: {
            type: DataTypes.CHAR(4),
            allowNull: true,
            field: "currency_2",
        },
        status: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
    },
    {
        sequelize,
        tableName: "fees",
        underscored: true,
        timestamps: true,
        indexes: [
            {
                fields: ["owner_type", "owner_id"],
                name: "fees_owner_type_owner_id_index",
            },
        ],
    },
);

export default Fee;
