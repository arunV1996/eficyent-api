"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();

        // 1. Bank Wallets
        if (!tables.includes("bank_wallets")) {
            await queryInterface.createTable("bank_wallets", {
                id: {
                    allowNull: false,
                    autoIncrement: true,
                    primaryKey: true,
                    type: Sequelize.BIGINT.UNSIGNED,
                },
                user_id: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: true,
                },
                team_member_id: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: true,
                },
                virtual_account_id: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: false,
                },
                currency: {
                    type: Sequelize.STRING(3),
                    allowNull: false,
                },
                total_balance: {
                    type: Sequelize.DECIMAL(12, 2),
                    allowNull: false,
                    defaultValue: 0.0,
                },
                used_balance: {
                    type: Sequelize.DECIMAL(12, 2),
                    allowNull: false,
                    defaultValue: 0.0,
                },
                available_balance: {
                    type: Sequelize.DECIMAL(12, 2),
                    allowNull: false,
                    defaultValue: 0.0,
                },
                last_sync_at: {
                    type: Sequelize.DATE,
                    allowNull: true,
                },
                created_at: {
                    allowNull: false,
                    type: Sequelize.DATE,
                },
                updated_at: {
                    allowNull: false,
                    type: Sequelize.DATE,
                },
            });
        }

        // 2. User Balances
        if (!tables.includes("user_balances")) {
            await queryInterface.createTable("user_balances", {
                id: {
                    allowNull: false,
                    autoIncrement: true,
                    primaryKey: true,
                    type: Sequelize.BIGINT.UNSIGNED,
                },
                user_id: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: false,
                },
                virtual_account_id: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: false,
                },
                balance: {
                    type: Sequelize.DECIMAL(12, 2),
                    allowNull: false,
                    defaultValue: 0.0,
                },
                created_at: {
                    allowNull: false,
                    type: Sequelize.DATE,
                },
                updated_at: {
                    allowNull: false,
                    type: Sequelize.DATE,
                },
            });
        }

        // We do not create Payout tables via normal migrations since they
        // belong to a different DB in Laravel. In a multi-db setup, those
        // would be migrated separately.
    },

    async down(queryInterface) {
        await queryInterface.dropTable("bank_wallets");
        await queryInterface.dropTable("user_balances");
    },
};
