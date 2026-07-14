import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Cached FX rate per (from_currency, to_currency, provider).
 * Mirror of the legacy `fx_rates` table.
 */

interface FxRateAttributes {
    id: number;
    fromCurrency: string;
    toCurrency: string;
    rate: string;
    provider: string | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

interface FxRateCreationAttributes
    extends Optional<FxRateAttributes, "id" | "provider"> {}

class FxRate
    extends Model<FxRateAttributes, FxRateCreationAttributes>
    implements FxRateAttributes
{
    public id!: number;
    public fromCurrency!: string;
    public toCurrency!: string;
    public rate!: string;
    public provider!: string | null;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

FxRate.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        fromCurrency: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        toCurrency: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        rate: {
            // DECIMAL comes back from MySQL as a string; keeping it a
            // string avoids float precision loss on money math.
            type: DataTypes.DECIMAL(18, 8),
            allowNull: false,
        },
        provider: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: "fx_rates",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default FxRate;
