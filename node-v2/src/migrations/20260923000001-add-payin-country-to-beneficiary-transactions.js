"use strict";

/** Optional payin country captured on payout creation. */
module.exports = {
    async up(queryInterface, Sequelize) {
        const columns = await queryInterface.describeTable(
            "beneficiary_transactions",
        );
        if (!columns.payin_country) {
            await queryInterface.addColumn(
                "beneficiary_transactions",
                "payin_country",
                {
                    type: Sequelize.STRING(255),
                    allowNull: true,
                    after: "receiving_currency",
                },
            );
        }
    },

    async down(queryInterface) {
        const columns = await queryInterface.describeTable(
            "beneficiary_transactions",
        );
        if (columns.payin_country) {
            await queryInterface.removeColumn(
                "beneficiary_transactions",
                "payin_country",
            );
        }
    },
};
