"use strict";

/** Entity grouping flag on merchants (parity with the Laravel schema). */
module.exports = {
    async up(queryInterface, Sequelize) {
        const columns = await queryInterface.describeTable("merchants");
        if (!columns.entity) {
            await queryInterface.addColumn("merchants", "entity", {
                type: Sequelize.TINYINT.UNSIGNED,
                allowNull: true,
                after: "type",
            });
        }
    },

    async down(queryInterface) {
        const columns = await queryInterface.describeTable("merchants");
        if (columns.entity) {
            await queryInterface.removeColumn("merchants", "entity");
        }
    },
};
