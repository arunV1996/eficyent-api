"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("user_informations", {
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
            country: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },
            address_1: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            address_2: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            city: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },
            state: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },
            postal_code: {
                type: Sequelize.STRING(50),
                allowNull: true,
            },
            purpose_of_transactions: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            business_verification_type: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            id_type: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            id_number: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            profession: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            source_of_income: {
                type: Sequelize.STRING(11),
                allowNull: true,
            },
            legal_name: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            tax_id: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },
            formation_date: {
                type: Sequelize.DATEONLY,
                allowNull: true,
            },
            country_of_incorporation: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            business_name: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            website: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            type_of_business: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            ip_address: {
                type: Sequelize.STRING(45),
                allowNull: true,
            },
            role: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },
            business_persons: {
                type: Sequelize.JSON,
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

        await queryInterface.addIndex("user_informations", {
            fields: ["user_id"],
            name: "user_informations_user_id_foreign",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("user_informations");
    },
};
