import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * CMS static page (about / privacy / terms / ...). Mirror of the
 * legacy `static_pages` table.
 */

interface StaticPageAttributes {
    id: number;
    uniqueId: string;
    title: string;
    description: string;
    type: string;
    footerSection: number;
    status: number;
    createdAt?: Date | null;
    updatedAt?: Date | null;
}

type OptionalStaticPageFields = Exclude<
    keyof StaticPageAttributes,
    "id" | "uniqueId" | "title" | "description"
>;

interface StaticPageCreationAttributes
    extends Optional<StaticPageAttributes, "id" | OptionalStaticPageFields> {}

class StaticPage
    extends Model<StaticPageAttributes, StaticPageCreationAttributes>
    implements StaticPageAttributes
{
    public id!: number;
    public uniqueId!: string;
    public title!: string;
    public description!: string;
    public type!: string;
    public footerSection!: number;
    public status!: number;

    public readonly createdAt!: Date | null;
    public readonly updatedAt!: Date | null;
}

StaticPage.init(
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        uniqueId: { type: DataTypes.STRING(255), allowNull: false },
        title: { type: DataTypes.STRING(255), allowNull: false },
        description: { type: DataTypes.TEXT("long"), allowNull: false },
        type: {
            type: DataTypes.STRING(255),
            allowNull: false,
            defaultValue: "others",
        },
        footerSection: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0,
        },
        status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    },
    {
        sequelize,
        tableName: "static_pages",
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default StaticPage;
