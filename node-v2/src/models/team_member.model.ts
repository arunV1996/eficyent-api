import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Team member row (soft-deleted). Mirror of the legacy `team_members`
 * table. Ported so the transaction resource can resolve `created_by`
 * for rows created by team members and the refund chain can rebuild the
 * team-member balance context — the team module's own endpoints are a
 * later tranche.
 */

interface TeamMemberAttributes {
    id: number;
    uniqueId: string;
    userId: number;
    senderId: number | null;
    name: string;
    email: string;
    mobileCountryCode: string | null;
    mobile: string | null;
    password: string;
    emailCode: string | null;
    emailCodeExpiry: string | null;
    lastPasswordReset: Date | null;
    apiKey: string | null;
    saltKey: string | null;
    privateKey: string | null;
    publicKey: string | null;
    role: number;
    permission: number;
    timezone: string;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
}

type OptionalTeamMemberFields = Exclude<
    keyof TeamMemberAttributes,
    "id" | "uniqueId" | "userId" | "name" | "email" | "password"
>;

interface TeamMemberCreationAttributes
    extends Optional<TeamMemberAttributes, "id" | OptionalTeamMemberFields> {}

class TeamMember
    extends Model<TeamMemberAttributes, TeamMemberCreationAttributes>
    implements TeamMemberAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number;
    public senderId!: number | null;
    public name!: string;
    public email!: string;
    public mobileCountryCode!: string | null;
    public mobile!: string | null;
    public password!: string;
    public emailCode!: string | null;
    public emailCodeExpiry!: string | null;
    public lastPasswordReset!: Date | null;
    public apiKey!: string | null;
    public saltKey!: string | null;
    public privateKey!: string | null;
    public publicKey!: string | null;
    public role!: number;
    public permission!: number;
    public timezone!: string;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
    public readonly deletedAt!: Date | null;
}

TeamMember.init(
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
        userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        senderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
        name: { type: DataTypes.STRING(50), allowNull: false },
        email: { type: DataTypes.STRING(50), allowNull: false, unique: true },
        mobileCountryCode: { type: DataTypes.STRING(255), allowNull: true },
        mobile: { type: DataTypes.STRING(255), allowNull: true },
        password: { type: DataTypes.STRING(255), allowNull: false },
        emailCode: { type: DataTypes.STRING(255), allowNull: true },
        emailCodeExpiry: { type: DataTypes.STRING(255), allowNull: true },
        lastPasswordReset: { type: DataTypes.DATE, allowNull: true },
        apiKey: { type: DataTypes.TEXT("long"), allowNull: true },
        saltKey: { type: DataTypes.TEXT("long"), allowNull: true },
        privateKey: { type: DataTypes.TEXT("long"), allowNull: true },
        publicKey: { type: DataTypes.TEXT("long"), allowNull: true },
        role: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
        permission: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
        },
        timezone: {
            type: DataTypes.STRING(30),
            allowNull: false,
            defaultValue: "Asia/Kolkata",
        },
        status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    },
    {
        sequelize,
        tableName: "team_members",
        underscored: true,
        timestamps: true,
        paranoid: true,
    },
);

export default TeamMember;
