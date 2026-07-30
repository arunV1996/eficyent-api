"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable(
            "deposit_transaction_status_histories",
            {
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
                deposit_transaction_id: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: false,
                    references: { model: "deposit_transactions", key: "id" },
                    onDelete: "CASCADE",
                },
                from_status: { type: Sequelize.STRING(255), allowNull: true },
                to_status: { type: Sequelize.STRING(255), allowNull: false },
                changed_by: { type: Sequelize.STRING(255), allowNull: true },
                changed_by_type: {
                    type: Sequelize.STRING(255),
                    allowNull: true,
                },
                changed_at: { type: "TIMESTAMP", allowNull: false },
                meta: { type: Sequelize.JSON, allowNull: true },
                created_at: { type: "TIMESTAMP", allowNull: true },
                updated_at: { type: "TIMESTAMP", allowNull: true },
            },
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable("deposit_transaction_status_histories");
    },
};
