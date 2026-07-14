"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const text = { type: Sequelize.TEXT, allowNull: true };
        const str = { type: Sequelize.STRING(255), allowNull: true };

        await queryInterface.addColumn("users", "email_code", str);
        await queryInterface.addColumn("users", "email_code_expiry", str);
        await queryInterface.addColumn("users", "tfa_secret", text);
        await queryInterface.addColumn("users", "backup_codes", text);
        await queryInterface.addColumn("users", "api_key", text);
        await queryInterface.addColumn("users", "salt_key", text);
        await queryInterface.addColumn("users", "private_key", text);
        await queryInterface.addColumn("users", "public_key", text);
        await queryInterface.addColumn("users", "device_type", str);
        await queryInterface.addColumn("users", "device_token", str);

        await queryInterface.createTable("password_reset_tokens", {
            email: {
                type: Sequelize.STRING(255),
                primaryKey: true,
                allowNull: false,
            },
            token: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("password_reset_tokens");
        for (const column of [
            "email_code",
            "email_code_expiry",
            "tfa_secret",
            "backup_codes",
            "api_key",
            "salt_key",
            "private_key",
            "public_key",
            "device_type",
            "device_token",
        ]) {
            await queryInterface.removeColumn("users", column);
        }
    },
};
