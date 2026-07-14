"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("supported_countries", {
            id: {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            unique_id: {
                type: Sequelize.STRING(255),
                allowNull: false,
                unique: true,
            },
            country_name: {
                type: Sequelize.STRING(50),
                allowNull: false,
            },
            country_code: {
                type: Sequelize.STRING(3),
                allowNull: false,
            },
            currency: {
                type: Sequelize.STRING(3),
                allowNull: false,
            },
            type: {
                type: Sequelize.STRING(3),
                allowNull: true,
            },
            external_type: {
                type: Sequelize.STRING(255),
                allowNull: true,
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
    },

    async down(queryInterface) {
        await queryInterface.dropTable("supported_countries");
    },
};
