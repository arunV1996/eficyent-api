"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("beneficiary_account_validations", {
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
            account_name: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            account_number: {
                type: Sequelize.STRING(255),
                allowNull: false,
                unique: true,
            },
            code: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            validation_service: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            external_reference_id: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            external_status: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            external_data: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            remarks: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            is_account_exists: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 0,
            },
            is_nre_account: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 0,
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
        });

        await queryInterface.addIndex("beneficiary_account_validations", {
            fields: ["user_id"],
            name: "beneficiary_account_validations_user_id_foreign",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("beneficiary_account_validations");
    },
};
