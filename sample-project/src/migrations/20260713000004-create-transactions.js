"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("transactions", {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            sender_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: "users",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            receiver_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: "users",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            sender_wallet_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: "wallets",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            receiver_wallet_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: "wallets",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            sender_amount: {
                type: Sequelize.DECIMAL(20, 8),
                allowNull: true,
            },
            receiver_amount: {
                type: Sequelize.DECIMAL(20, 8),
                allowNull: true,
            },
            exchange_rate: {
                type: Sequelize.DECIMAL(20, 8),
                allowNull: true,
                defaultValue: 1.0,
            },
            type: {
                type: Sequelize.ENUM(
                    "deposit",
                    "withdrawal",
                    "transfer",
                    "trade",
                ),
                allowNull: false,
            },
            status: {
                type: Sequelize.ENUM(
                    "pending",
                    "completed",
                    "failed",
                    "cancelled",
                ),
                allowNull: false,
                defaultValue: "pending",
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

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable("transactions");
    },
};
