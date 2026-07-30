"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("static_pages", {
            id: {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            unique_id: { type: Sequelize.STRING(255), allowNull: false },
            title: { type: Sequelize.STRING(255), allowNull: false },
            description: { type: Sequelize.TEXT("long"), allowNull: false },
            type: {
                type: Sequelize.ENUM(
                    "about",
                    "privacy",
                    "terms",
                    "refund",
                    "cancellation",
                    "others",
                    "help",
                    "contact",
                    "faq",
                ),
                allowNull: false,
                defaultValue: "others",
            },
            footer_section: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 0,
            },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            created_at: { type: "TIMESTAMP", allowNull: true },
            updated_at: { type: "TIMESTAMP", allowNull: true },
        });
        await queryInterface.addIndex("static_pages", {
            fields: ["title"],
            name: "static_pages_title_index",
        });
        await queryInterface.addIndex("static_pages", {
            fields: ["unique_id"],
            name: "static_pages_unique_id_index",
        });

        await queryInterface.addColumn("users", "business_user_id", {
            type: Sequelize.BIGINT.UNSIGNED,
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("users", "business_user_id");
        await queryInterface.dropTable("static_pages");
    },
};
