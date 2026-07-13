import { Model, DataTypes, Optional } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";
import Wallet from "./wallet.model";
import * as constants from "../utils/constants";

interface TransactionAttributes {
    id: number;
    sender_id?: number | null;
    receiver_id?: number | null;
    sender_wallet_id?: number | null;
    receiver_wallet_id?: number | null;
    sender_amount?: number | null;
    receiver_amount?: number | null;
    exchange_rate?: number | null;
    type:
        | typeof constants.TRANSACTION_TYPE_DEPOSIT
        | typeof constants.TRANSACTION_TYPE_WITHDRAWAL
        | typeof constants.TRANSACTION_TYPE_TRANSFER
        | typeof constants.TRANSACTION_TYPE_TRADE;
    status:
        | typeof constants.TRANSACTION_STATUS_PENDING
        | typeof constants.TRANSACTION_STATUS_PROCESSING
        | typeof constants.TRANSACTION_STATUS_COMPLETED
        | typeof constants.TRANSACTION_STATUS_FAILED
        | typeof constants.TRANSACTION_STATUS_CANCELLED;
    created_at?: Date;
    updated_at?: Date;
}

interface TransactionCreationAttributes extends Optional<
    TransactionAttributes,
    | "id"
    | "sender_id"
    | "receiver_id"
    | "sender_wallet_id"
    | "receiver_wallet_id"
    | "sender_amount"
    | "receiver_amount"
    | "exchange_rate"
    | "status"
> {}

class Transaction
    extends Model<TransactionAttributes, TransactionCreationAttributes>
    implements TransactionAttributes
{
    public id!: number;
    public sender_id!: number | null;
    public receiver_id!: number | null;
    public sender_wallet_id!: number | null;
    public receiver_wallet_id!: number | null;
    public sender_amount!: number | null;
    public receiver_amount!: number | null;
    public exchange_rate!: number | null;
    public type!:
        | typeof constants.TRANSACTION_TYPE_DEPOSIT
        | typeof constants.TRANSACTION_TYPE_WITHDRAWAL
        | typeof constants.TRANSACTION_TYPE_TRANSFER
        | typeof constants.TRANSACTION_TYPE_TRADE;
    public status!:
        | typeof constants.TRANSACTION_STATUS_PENDING
        | typeof constants.TRANSACTION_STATUS_PROCESSING
        | typeof constants.TRANSACTION_STATUS_COMPLETED
        | typeof constants.TRANSACTION_STATUS_FAILED
        | typeof constants.TRANSACTION_STATUS_CANCELLED;

    public readonly created_at!: Date;
    public readonly updated_at!: Date;
}

Transaction.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        sender_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: User,
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        receiver_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: User,
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        sender_wallet_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: Wallet,
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        receiver_wallet_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: Wallet,
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        sender_amount: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: true,
        },
        receiver_amount: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: true,
        },
        exchange_rate: {
            type: DataTypes.DECIMAL(20, 8),
            allowNull: true,
            defaultValue: 1.0,
        },
        type: {
            type: DataTypes.ENUM(
                constants.TRANSACTION_TYPE_DEPOSIT,
                constants.TRANSACTION_TYPE_WITHDRAWAL,
                constants.TRANSACTION_TYPE_TRANSFER,
                constants.TRANSACTION_TYPE_TRADE,
            ),
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM(
                constants.TRANSACTION_STATUS_PENDING,
                constants.TRANSACTION_STATUS_PROCESSING,
                constants.TRANSACTION_STATUS_COMPLETED,
                constants.TRANSACTION_STATUS_FAILED,
                constants.TRANSACTION_STATUS_CANCELLED,
            ),
            allowNull: false,
            defaultValue: constants.TRANSACTION_STATUS_PENDING,
        },
    },
    {
        sequelize,
        tableName: "transactions",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

// Define associations
// Sender User relationship
User.hasMany(Transaction, { foreignKey: "sender_id", as: "sentTransactions" });
Transaction.belongsTo(User, { foreignKey: "sender_id", as: "sender" });

// Receiver User relationship
User.hasMany(Transaction, {
    foreignKey: "receiver_id",
    as: "receivedTransactions",
});
Transaction.belongsTo(User, { foreignKey: "receiver_id", as: "receiver" });

// Sender Wallet relationship
Wallet.hasMany(Transaction, {
    foreignKey: "sender_wallet_id",
    as: "sentTransactions",
});
Transaction.belongsTo(Wallet, {
    foreignKey: "sender_wallet_id",
    as: "senderWallet",
});

// Receiver Wallet relationship
Wallet.hasMany(Transaction, {
    foreignKey: "receiver_wallet_id",
    as: "receivedTransactions",
});
Transaction.belongsTo(Wallet, {
    foreignKey: "receiver_wallet_id",
    as: "receiverWallet",
});

export default Transaction;
