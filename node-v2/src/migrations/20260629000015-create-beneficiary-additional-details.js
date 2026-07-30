"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("beneficiary_additional_details", {
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
            beneficiary_account_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: "beneficiary_accounts", key: "id" },
                onDelete: "CASCADE",
            },
            address_type: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            address_line1: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            address_line2: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            postal_code: {
                type: Sequelize.STRING(20),
                allowNull: true,
            },
            city: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            state: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            country: {
                type: Sequelize.STRING(3),
                allowNull: true,
            },
            payment_type: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            bank_address_line1: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            bank_address_line2: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            bank_postal_code: {
                type: Sequelize.STRING(20),
                allowNull: true,
            },
            bank_city: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            bank_state: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            bank_country: {
                type: Sequelize.STRING(3),
                allowNull: true,
            },
            user_source_of_income: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            purpose_of_transaction: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            created_at: {
                type: "TIMESTAMP",
                allowNull: true,
            },
            updated_at: {
                type: "TIMESTAMP",
                allowNull: true,
            },
            deleted_at: {
                type: "TIMESTAMP",
                allowNull: true,
            },
        });

        await queryInterface.addIndex("beneficiary_additional_details", {
            fields: ["beneficiary_account_id"],
            name: "beneficiary_additional_details_beneficiary_account_id_foreign",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("beneficiary_additional_details");
    },
};
