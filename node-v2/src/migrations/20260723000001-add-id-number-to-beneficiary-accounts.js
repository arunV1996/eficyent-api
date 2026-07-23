"use strict";

/**
 * Adds beneficiary_accounts.id_number for corridors whose payouts carry
 * a beneficiary ID (e.g. CHN local currency). Guarded with a column
 * check so environments where the column already exists (added on the
 * Laravel side) are untouched.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable(
            "beneficiary_accounts",
        );
        if (!table.id_number) {
            await queryInterface.addColumn("beneficiary_accounts", "id_number", {
                type: Sequelize.STRING(255),
                allowNull: true,
                after: "iban",
            });
        }
    },

    async down(queryInterface) {
        const table = await queryInterface.describeTable(
            "beneficiary_accounts",
        );
        if (table.id_number) {
            await queryInterface.removeColumn(
                "beneficiary_accounts",
                "id_number",
            );
        }
    },
};
