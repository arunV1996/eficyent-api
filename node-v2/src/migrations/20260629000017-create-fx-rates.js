"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("fx_rates", {
            id: {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            from_currency: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            to_currency: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            rate: {
                type: Sequelize.DECIMAL(18, 8),
                allowNull: false,
            },
            provider: {
                type: Sequelize.STRING(255),
                allowNull: true,
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
        await queryInterface.dropTable("fx_rates");
    },
};
