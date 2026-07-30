"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const str = { type: Sequelize.STRING(255), allowNull: true };
        const longText = { type: Sequelize.TEXT("long"), allowNull: true };

        await queryInterface.createTable("team_members", {
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
            sender_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
            },
            name: { type: Sequelize.STRING(50), allowNull: false },
            email: {
                type: Sequelize.STRING(50),
                allowNull: false,
                unique: true,
            },
            mobile_country_code: str,
            mobile: str,
            password: { type: Sequelize.STRING(255), allowNull: false },
            email_code: str,
            email_code_expiry: str,
            last_password_reset: { type: "TIMESTAMP", allowNull: true },
            api_key: longText,
            salt_key: longText,
            private_key: longText,
            public_key: longText,
            role: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 3,
            },
            permission: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 2,
            },
            timezone: {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: "Asia/Kolkata",
            },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            created_at: { type: "TIMESTAMP", allowNull: true },
            updated_at: { type: "TIMESTAMP", allowNull: true },
            deleted_at: { type: "TIMESTAMP", allowNull: true },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("team_members");
    },
};
