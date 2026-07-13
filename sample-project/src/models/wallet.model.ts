import { Model, DataTypes, Optional } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";
import Currency from "./currency.model";

interface WalletAttributes {
    id: number;
    user_id: number;
    currency: string;
    total: number;
    remaining: number;
    onhold: number;
    used: number;
    created_at?: Date;
    updated_at?: Date;
}

interface WalletCreationAttributes extends Optional<
    WalletAttributes,
    "id" | "total" | "remaining" | "onhold" | "used"
> {}

class Wallet
    extends Model<WalletAttributes, WalletCreationAttributes>
    implements WalletAttributes
{
    public id!: number;
    public user_id!: number;
    public currency!: string;
    public total!: number;
    public remaining!: number;
    public onhold!: number;
    public used!: number;

    public readonly created_at!: Date;
    public readonly updated_at!: Date;
}

Wallet.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: User,
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
        },
        currency: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        total: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0.0,
        },
        remaining: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0.0,
        },
        onhold: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0.0,
        },
        used: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0.0,
        },
    },
    {
        sequelize,
        tableName: "wallets",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

// Define associations
User.hasMany(Wallet, { foreignKey: "user_id", as: "wallets" });
Wallet.belongsTo(User, { foreignKey: "user_id", as: "user" });
Wallet.belongsTo(Currency, {
    foreignKey: "currency",
    targetKey: "code",
    as: "currencyDetail",
});

export default Wallet;
