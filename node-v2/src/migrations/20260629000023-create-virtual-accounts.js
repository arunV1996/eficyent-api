"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("virtual_accounts", {
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
            user_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
                references: { model: "users", key: "id" },
                onDelete: "CASCADE",
            },
            country: {
                type: Sequelize.STRING(100),
                allowNull: false,
                defaultValue: "US",
            },
            currency: {
                type: Sequelize.STRING(100),
                allowNull: false,
                defaultValue: "USD",
            },
            account_number: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            account_holder_name: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            account_holder_address: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            account_bank_name: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            account_bank_code: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            account_bank_address: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            routing_number: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            external_type: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            external_reference_id: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            external_data: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 0,
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

        await queryInterface.addIndex("virtual_accounts", {
            fields: ["user_id"],
            name: "virtual_accounts_user_id_foreign",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("virtual_accounts");
    },
};
