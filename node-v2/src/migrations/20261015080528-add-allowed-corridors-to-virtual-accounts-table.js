"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const columns = await queryInterface.describeTable("virtual_accounts");
        if (!columns.allowed_corridors) {
            await queryInterface.addColumn(
                "virtual_accounts",
                "allowed_corridors",
                {
                    type: Sequelize.JSON,
                    allowNull: true,
                    after: "status",
                },
            );
        }
    },

    async down(queryInterface) {
        const columns = await queryInterface.describeTable("virtual_accounts");
        if (columns.allowed_corridors) {
            await queryInterface.removeColumn(
                "virtual_accounts",
                "allowed_corridors",
            );
        }
    },
};
