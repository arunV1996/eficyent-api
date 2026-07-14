import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import type SenderDocument from "./sender_document.model";

/**
 * Remitter (sender) row. Mirror of the legacy `senders` table
 * (soft-deleted via deleted_at).
 */

interface SenderAttributes {
    id: number;
    uniqueId: string;
    userId: number;
    teamMemberId: number | null;
    title: string | null;
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
    email: string | null;
    mobileCountryCode: string | null;
    mobile: string | null;
    dob: Date | null;
    country: string | null;
    nationality: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    type: number | null;
    idType: string | null;
    idNumber: string | null;
    sourceOfFunds: string | null;
    businessPersons: unknown | null;
    status: number;
    clientReferenceId: string | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
}

type OptionalSenderFields = Exclude<
    keyof SenderAttributes,
    "id" | "uniqueId" | "userId"
>;

interface SenderCreationAttributes
    extends Optional<SenderAttributes, "id" | OptionalSenderFields> {}

class Sender
    extends Model<SenderAttributes, SenderCreationAttributes>
    implements SenderAttributes
{
    public id!: number;
    public uniqueId!: string;
    public userId!: number;
    public teamMemberId!: number | null;
    public title!: string | null;
    public firstName!: string | null;
    public middleName!: string | null;
    public lastName!: string | null;
    public email!: string | null;
    public mobileCountryCode!: string | null;
    public mobile!: string | null;
    public dob!: Date | null;
    public country!: string | null;
    public nationality!: string | null;
    public address1!: string | null;
    public address2!: string | null;
    public city!: string | null;
    public state!: string | null;
    public postalCode!: string | null;
    public type!: number | null;
    public idType!: string | null;
    public idNumber!: string | null;
    public sourceOfFunds!: string | null;
    public businessPersons!: unknown | null;
    public status!: number;
    public clientReferenceId!: string | null;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
    public readonly deletedAt!: Date | null;

    // Eager-loaded association (declared in sender_document.model.ts).
    public readonly documents?: SenderDocument[];
}

Sender.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        uniqueId: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        teamMemberId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            field: "team_member_id",
        },
        title: { type: DataTypes.STRING(5), allowNull: true },
        firstName: { type: DataTypes.STRING(100), allowNull: true },
        middleName: { type: DataTypes.STRING(100), allowNull: true },
        lastName: { type: DataTypes.STRING(100), allowNull: true },
        email: { type: DataTypes.STRING(255), allowNull: true },
        mobileCountryCode: { type: DataTypes.STRING(255), allowNull: true },
        mobile: { type: DataTypes.STRING(255), allowNull: true },
        dob: { type: DataTypes.DATEONLY, allowNull: true },
        country: { type: DataTypes.STRING(100), allowNull: true },
        nationality: { type: DataTypes.STRING(255), allowNull: true },
        address1: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "address_1",
        },
        address2: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "address_2",
        },
        city: { type: DataTypes.STRING(100), allowNull: true },
        state: { type: DataTypes.STRING(100), allowNull: true },
        postalCode: { type: DataTypes.STRING(50), allowNull: true },
        type: { type: DataTypes.TINYINT, allowNull: true, defaultValue: 1 },
        idType: { type: DataTypes.STRING(255), allowNull: true },
        idNumber: { type: DataTypes.STRING(255), allowNull: true },
        sourceOfFunds: { type: DataTypes.STRING(255), allowNull: true },
        businessPersons: { type: DataTypes.JSON, allowNull: true },
        status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
        clientReferenceId: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
        sequelize,
        tableName: "senders",
        underscored: true,
        timestamps: true,
        paranoid: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        deletedAt: "deleted_at",
        indexes: [
            { fields: ["user_id"], name: "senders_user_id_foreign" },
        ],
    },
);

export default Sender;
