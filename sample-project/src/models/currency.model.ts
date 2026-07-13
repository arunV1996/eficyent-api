import { Model, DataTypes, Optional } from "sequelize";
import sequelize from "../config/database";
import * as constants from "../utils/constants";

interface CurrencyAttributes {
    id: number;
    code: string;
    name: string;
    type:
        | typeof constants.CURRENCY_TYPE_FIAT
        | typeof constants.CURRENCY_TYPE_CRYPTO;
    status:
        | typeof constants.CURRENCY_STATUS_ACTIVE
        | typeof constants.CURRENCY_STATUS_INACTIVE;
    created_at?: Date;
    updated_at?: Date;
}

interface CurrencyCreationAttributes extends Optional<
    CurrencyAttributes,
    "id" | "status"
> {}

class Currency
    extends Model<CurrencyAttributes, CurrencyCreationAttributes>
    implements CurrencyAttributes
{
    public id!: number;
    public code!: string;
    public name!: string;
    public type!:
        | typeof constants.CURRENCY_TYPE_FIAT
        | typeof constants.CURRENCY_TYPE_CRYPTO;
    public status!:
        | typeof constants.CURRENCY_STATUS_ACTIVE
        | typeof constants.CURRENCY_STATUS_INACTIVE;

    public readonly created_at!: Date;
    public readonly updated_at!: Date;
}

Currency.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        code: {
            type: DataTypes.STRING(10),
            allowNull: false,
            unique: true,
        },
        name: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM(
                constants.CURRENCY_TYPE_FIAT,
                constants.CURRENCY_TYPE_CRYPTO,
            ),
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM(
                constants.CURRENCY_STATUS_ACTIVE,
                constants.CURRENCY_STATUS_INACTIVE,
            ),
            allowNull: false,
            defaultValue: constants.CURRENCY_STATUS_ACTIVE,
        },
    },
    {
        sequelize,
        tableName: "currencies",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default Currency;
