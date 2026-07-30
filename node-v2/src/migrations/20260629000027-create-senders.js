"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const str = { type: Sequelize.STRING(255), allowNull: true };

        await queryInterface.createTable("senders", {
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
            team_member_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
            },
            title: { type: Sequelize.STRING(5), allowNull: true },
            first_name: { type: Sequelize.STRING(100), allowNull: true },
            middle_name: { type: Sequelize.STRING(100), allowNull: true },
            last_name: { type: Sequelize.STRING(100), allowNull: true },
            email: str,
            mobile_country_code: str,
            mobile: str,
            dob: { type: Sequelize.DATEONLY, allowNull: true },
            country: { type: Sequelize.STRING(100), allowNull: true },
            nationality: str,
            address_1: str,
            address_2: str,
            city: { type: Sequelize.STRING(100), allowNull: true },
            state: { type: Sequelize.STRING(100), allowNull: true },
            postal_code: { type: Sequelize.STRING(50), allowNull: true },
            type: {
                type: Sequelize.TINYINT,
                allowNull: true,
                defaultValue: 1,
            },
            id_type: str,
            id_number: str,
            source_of_funds: str,
            business_persons: { type: Sequelize.JSON, allowNull: true },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            client_reference_id: str,
            created_at: {
                type: "TIMESTAMP",
                allowNull: true,
            },
            updated_at: { type: "TIMESTAMP", allowNull: true },
            deleted_at: { type: "TIMESTAMP", allowNull: true },
        });

        await queryInterface.addIndex("senders", {
            fields: ["user_id"],
            name: "senders_user_id_foreign",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("senders");
    },
};
