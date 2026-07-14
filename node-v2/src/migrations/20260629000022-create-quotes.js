"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("quotes", {
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
                allowNull: false,
                references: { model: "users", key: "id" },
                onDelete: "CASCADE",
            },
            beneficiary_account_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
            },
            virtual_account_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
            },
            source_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
            },
            source_type: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },
            total_sending_amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: true,
            },
            commission_type: {
                type: Sequelize.TINYINT,
                allowNull: true,
            },
            commission_value: {
                type: Sequelize.DECIMAL(8, 2),
                allowNull: false,
                defaultValue: 0,
            },
            commission_amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },
            merchant_commission_amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: true,
            },
            external_commission_amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },
            receiving_amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },
            fx_rate: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            internal_fx_rate: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            external_fx_rate: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            quote_type: {
                type: Sequelize.STRING(255),
                allowNull: false,
                defaultValue: "FORWARD",
            },
            recipient_type: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            recipient_country: {
                type: Sequelize.STRING(10),
                allowNull: true,
            },
            receiving_currency: {
                type: Sequelize.STRING(5),
                allowNull: true,
            },
            payment_rail: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 0,
            },
            external_type: {
                type: Sequelize.STRING(255),
                allowNull: false,
                defaultValue: "ec",
            },
            external_reference_id: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            external_data: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            expires_at: {
                type: Sequelize.DATE,
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

        await queryInterface.addIndex("quotes", {
            fields: ["expires_at"],
            name: "quotes_expires_at_index",
        });
        await queryInterface.addIndex("quotes", {
            fields: ["user_id", "status"],
            name: "quotes_user_id_status_index",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("quotes");
    },
};
