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
                type: Sequelize.STRING(64),
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
                allowNull: false,
            },
            mobile_country_code: {
                type: Sequelize.STRING(10),
                allowNull: true,
            },
            mobile: {
                type: Sequelize.STRING(30),
                allowNull: true,
            },
            user_type: {
                type: Sequelize.TINYINT.UNSIGNED,
                allowNull: false,
                defaultValue: 1,
            },
            user_role: {
                type: Sequelize.TINYINT.UNSIGNED,
                allowNull: false,
                defaultValue: 1,
            },
            is_tfa_enabled: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            is_tfa_setup_completed: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            email_verified_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("users");
    },
};
