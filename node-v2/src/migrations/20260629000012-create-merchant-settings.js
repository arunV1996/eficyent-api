"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("merchant_settings", {
            id: {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            unique_id: {
                type: Sequelize.STRING(40),
                allowNull: false,
                unique: true,
            },
            merchant_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: "merchants", key: "id" },
                onDelete: "CASCADE",
            },
            key: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            value: {
                type: Sequelize.TEXT,
                allowNull: false,
            },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: true,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
        });

        await queryInterface.addIndex("merchant_settings", {
            fields: ["merchant_id"],
            name: "merchant_settings_merchant_id_foreign",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("merchant_settings");
    },
};
