"use strict";

/**
 * Columns backing the wallet<->bank transfer linkage (the models in the
 * reference codebase expect them; the guide's migration set omitted
 * them): deposits can target a wallet and wallet transactions link back
 * to the staging deposit row.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const depositColumns = await queryInterface.describeTable(
            "deposit_transactions",
        );
        if (!depositColumns.wallet_id) {
            await queryInterface.addColumn(
                "deposit_transactions",
                "wallet_id",
                {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: true,
                    after: "team_member_id",
                },
            );
        }

        const walletTxColumns = await queryInterface.describeTable(
            "wallet_transactions",
        );
        if (!walletTxColumns.deposit_transaction_id) {
            await queryInterface.addColumn(
                "wallet_transactions",
                "deposit_transaction_id",
                {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: true,
                    after: "quote_id",
                },
            );
        }
    },

    async down(queryInterface) {
        const walletTxColumns = await queryInterface.describeTable(
            "wallet_transactions",
        );
        if (walletTxColumns.deposit_transaction_id) {
            await queryInterface.removeColumn(
                "wallet_transactions",
                "deposit_transaction_id",
            );
        }
        const depositColumns = await queryInterface.describeTable(
            "deposit_transactions",
        );
        if (depositColumns.wallet_id) {
            await queryInterface.removeColumn(
                "deposit_transactions",
                "wallet_id",
            );
        }
    },
};
