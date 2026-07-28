"use strict";

/**
 * Converts wallets.business_model from the legacy integer flag to a
 * VARCHAR(64) business-model slug ('mto' | 'deal_based'), defaulting
 * to 'mto'. Existing integer data is mapped in place: 0 -> 'mto',
 * 1 -> 'deal_based'. Environments where the column never existed
 * (fresh installs) get it created directly as VARCHAR.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable("wallets");

        if (!table.business_model) {
            await queryInterface.addColumn("wallets", "business_model", {
                type: Sequelize.STRING(64),
                allowNull: true,
                defaultValue: "mto",
                after: "balance",
            });
            return;
        }

        // The column exists as the legacy integer flag — widen it and
        // map the values in place.
        await queryInterface.sequelize.query(
            "ALTER TABLE wallets MODIFY COLUMN business_model VARCHAR(64) DEFAULT 'mto';",
        );
        await queryInterface.sequelize.query(
            "UPDATE wallets SET business_model = 'mto' WHERE business_model = '0';",
        );
        await queryInterface.sequelize.query(
            "UPDATE wallets SET business_model = 'deal_based' WHERE business_model = '1';",
        );
    },

    async down(queryInterface) {
        const table = await queryInterface.describeTable("wallets");
        if (!table.business_model) {
            return;
        }
        await queryInterface.sequelize.query(
            "UPDATE wallets SET business_model = '0' WHERE business_model = 'mto';",
        );
        await queryInterface.sequelize.query(
            "UPDATE wallets SET business_model = '1' WHERE business_model = 'deal_based';",
        );
        await queryInterface.sequelize.query(
            "ALTER TABLE wallets MODIFY COLUMN business_model TINYINT DEFAULT 0;",
        );
    },
};
