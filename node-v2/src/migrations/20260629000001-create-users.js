"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("users", {
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
            email: {
                type: Sequelize.STRING(255),
                allowNull: false,
                unique: true,
            },
            password: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            picture: {
                type: Sequelize.STRING(255),
                allowNull: false,
                // Relative path; the app origin (APP_URL) is
                // prepended at runtime by the User model getter.
                defaultValue: "/placeholders/placeholder.png",
            },
            mobile_country_code: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            mobile: {
                type: Sequelize.STRING(255),
                allowNull: true,
                unique: true,
            },
            user_type: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 0,
            },
            user_role: {
                type: Sequelize.TINYINT,
                allowNull: true,
            },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            browser_id: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            remember_token: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },
            compliance_merchant_id: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            is_tfa_enabled: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: false,
            },
            is_tfa_setup_completed: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: false,
            },
            email_verified_at: {
                type: "TIMESTAMP",
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
    },

    async down(queryInterface) {
        await queryInterface.dropTable("users");
    },
};
