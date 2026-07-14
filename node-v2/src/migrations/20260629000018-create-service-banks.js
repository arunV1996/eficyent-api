"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("service_banks", {
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
            bank_id: {
                type: Sequelize.STRING(255),
                allowNull: false,
                unique: true,
            },
            bank_name: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            iso_code: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            country: {
                type: Sequelize.STRING(3),
                allowNull: false,
            },
            currency: {
                type: Sequelize.STRING(10),
                allowNull: true,
            },
            service_type: {
                type: Sequelize.STRING(3),
                allowNull: true,
            },
            external_type: {
                type: Sequelize.STRING(11),
                allowNull: true,
            },
            status: {
                type: Sequelize.STRING(255),
                allowNull: false,
                defaultValue: "1",
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
            deleted_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("service_banks");
    },
};
