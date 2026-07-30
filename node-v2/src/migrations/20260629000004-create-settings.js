"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("settings", {
            id: {
                type: Sequelize.INTEGER.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            key: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            value: {
                type: Sequelize.TEXT,
                allowNull: false,
            },
            created_at: {
                type: "TIMESTAMP",
                allowNull: true,
            },
            updated_at: {
                type: "TIMESTAMP",
                allowNull: true,
            },
        });

        await queryInterface.addIndex("settings", {
            fields: ["key"],
            name: "settings_key_index",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("settings");
    },
};
