"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("external_service_calls", {
            id: {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            beneficiary_transaction_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
            },
            deposit_transaction_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
            },
            external_type: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            action: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            method: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            endpoint: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            request_payload: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            response_payload: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            http_status: {
                type: Sequelize.INTEGER,
                allowNull: true,
            },
            success: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            external_reference_id: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            error_message: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            response_time_ms: {
                type: Sequelize.INTEGER,
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
        });

        await queryInterface.addIndex("external_service_calls", {
            fields: ["beneficiary_transaction_id"],
            name: "external_service_calls_beneficiary_transaction_id_index",
        });
        await queryInterface.addIndex("external_service_calls", {
            fields: ["deposit_transaction_id"],
            name: "external_service_calls_deposit_transaction_id_index",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("external_service_calls");
    },
};
