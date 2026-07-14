import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

/**
 * Password reset token row (Laravel-standard table: email is the
 * primary key, one active token per email, no updated_at).
 */

interface PasswordResetTokenAttributes {
    email: string;
    token: string;
    createdAt: Date | null;
}

class PasswordResetToken
    extends Model<PasswordResetTokenAttributes>
    implements PasswordResetTokenAttributes
{
    public email!: string;
    public token!: string;
    public createdAt!: Date | null;
}

PasswordResetToken.init(
    {
        email: {
            type: DataTypes.STRING(255),
            primaryKey: true,
        },
        token: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: "created_at",
        },
    },
    {
        sequelize,
        tableName: "password_reset_tokens",
        timestamps: false,
    },
);

export default PasswordResetToken;
