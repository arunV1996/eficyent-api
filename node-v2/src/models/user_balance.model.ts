import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

/** Cached per-user virtual-account balance row. */
class UserBalance extends Model {
    public id!: number;
    public userId!: number;
    public virtualAccountId!: number;
    public balance!: number;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

UserBalance.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },
        virtualAccountId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },
        balance: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.0,
        },
    },
    {
        sequelize,
        tableName: "user_balances",
        underscored: true,
        timestamps: true,
    },
);

export default UserBalance;
