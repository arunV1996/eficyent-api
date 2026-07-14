"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("wallet_transactions", "transaction_id", {
            type: Sequelize.STRING(255),
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn(
            "wallet_transactions",
            "transaction_id",
        );
    },
};
