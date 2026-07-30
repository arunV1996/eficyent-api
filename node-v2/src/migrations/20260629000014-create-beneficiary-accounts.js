"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const string255Nullable = {
            type: Sequelize.STRING(255),
            allowNull: true,
        };

        await queryInterface.createTable("beneficiary_accounts", {
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
            team_member_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
            },
            currency: {
                type: Sequelize.STRING(3),
                allowNull: false,
                defaultValue: "USD",
            },
            country: {
                type: Sequelize.STRING(4),
                allowNull: false,
                defaultValue: "US",
            },
            type: {
                type: Sequelize.TINYINT,
                allowNull: true,
                defaultValue: 1,
            },
            first_name: string255Nullable,
            middle_name: string255Nullable,
            last_name: string255Nullable,
            email: string255Nullable,
            mobile_country_code: string255Nullable,
            mobile: string255Nullable,
            payment_rail: string255Nullable,
            service_bank: string255Nullable,
            bank_name: string255Nullable,
            routing_number: string255Nullable,
            account_name: string255Nullable,
            account_number: string255Nullable,
            account_type: string255Nullable,
            swift_code: string255Nullable,
            iban: string255Nullable,
            intermediary_bank_swift_code: string255Nullable,
            intermediary_bank_name: string255Nullable,
            intermediary_bank_aba: string255Nullable,
            intermediary_bank_address: string255Nullable,
            intermediary_bank_city: string255Nullable,
            intermediary_bank_state: string255Nullable,
            intermediary_bank_postal_code: string255Nullable,
            intermediary_bank_country: string255Nullable,
            bank_country: {
                type: Sequelize.STRING(3),
                allowNull: true,
            },
            business_name: string255Nullable,
            business_country: {
                type: Sequelize.STRING(3),
                allowNull: true,
            },
            external_type: string255Nullable,
            external_reference_id: string255Nullable,
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

        await queryInterface.addIndex("beneficiary_accounts", {
            fields: ["user_id", "status"],
        });
        // The composite above covers the user_id FK (as in Laravel);
        // drop the auto-created single-column FK index if present.
        await queryInterface
            .removeIndex("beneficiary_accounts", "user_id")
            .catch(() => undefined);
    },

    async down(queryInterface) {
        await queryInterface.dropTable("beneficiary_accounts");
    },
};
