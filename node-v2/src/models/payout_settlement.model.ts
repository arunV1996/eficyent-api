import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

/**
 * Settlement journal row written by the payout sweeper: which payout
 * rows were settled/purged in one batch, against which balance scope.
 */
class PayoutSettlement extends Model {
    public id!: number;
    public runDate!: string;
    public scopeType!: string | null;
    public scopeId!: number | null;
    public bucket!: string;
    public rowIds!: number[];
    public rowCount!: number;
    public totalAmount!: number;
    public status!: string;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

PayoutSettlement.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        runDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        scopeType: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        scopeId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },
        bucket: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        rowIds: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        rowCount: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        totalAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
    },
    {
        sequelize,
        tableName: "payout_settlements",
        underscored: true,
        timestamps: true,
    },
);

export default PayoutSettlement;
