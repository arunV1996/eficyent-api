"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("admin_wallets", {
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
            wallet_name: { type: Sequelize.STRING(50), allowNull: false },
            wallet_address: { type: Sequelize.STRING(255), allowNull: false },
            network: { type: Sequelize.STRING(50), allowNull: true },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            deleted_at: { type: "TIMESTAMP", allowNull: true },
            created_at: { type: "TIMESTAMP", allowNull: true },
            updated_at: { type: "TIMESTAMP", allowNull: true },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("admin_wallets");
    },
};
