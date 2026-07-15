import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";
import VirtualAccount from "./virtual_account.model";
import Wallet from "./wallet.model";

/**
 * Balance anchor rows for virtual accounts / wallets, tied
 * polymorphically to the originating transaction. Mirror of the
 * legacy `ledgers` table.
 */

interface LedgerAttributes {
    id: number;
    uniqueId: string;
    userId: number;
    virtualAccountId: number | null;
    walletId: number | null;
    transactionType: string | null;
    transactionId: number | null;
    balance: string;
    externalType: string | null;
    description: string | null;
    refundLedgerId: number | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

type OptionalLedgerFields = Exclude<
    keyof LedgerAttributes,
    "id" | "uniqueId" | "userId" | "balance"
>;

interface LedgerCreationAttributes
    extends Optional<LedgerAttributes, "id" | "balance" | OptionalLedgerFields> {}

class Ledger
    extends Model<LedgerAttributes, LedgerCreationAttributes>
    implements LedgerAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number;
    public virtualAccountId!: number | null;
    public walletId!: number | null;
    public transactionType!: string | null;
    public transactionId!: number | null;
    public balance!: string;
    public externalType!: string | null;
    public description!: string | null;
    public refundLedgerId!: number | null;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;

    // Eager-loaded associations (aliases mirror the legacy Prisma
    // include names).
    public readonly wallet?: Wallet;
    public readonly virtualAccount?: VirtualAccount;
    public readonly users?: User;
}

Ledger.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        uniqueId: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        virtualAccountId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
        walletId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
        transactionType: { type: DataTypes.STRING(255), allowNull: true },
        transactionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
        balance: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0,
        },
        externalType: { type: DataTypes.STRING(255), allowNull: true },
        description: { type: DataTypes.TEXT, allowNull: true },
        refundLedgerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    },
    {
        sequelize,
        tableName: "ledgers",
        underscored: true,
        timestamps: true,
    },
);

// Aliases mirror the legacy Prisma include names.
Ledger.belongsTo(Wallet, { foreignKey: "walletId", as: "wallet" });
Ledger.belongsTo(VirtualAccount, {
    foreignKey: "virtualAccountId",
    as: "virtualAccount",
});
Ledger.belongsTo(User, { foreignKey: "userId", as: "users" });

export default Ledger;
