"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const columns = await queryInterface.describeTable("service_banks");
        if (!columns.rail) {
            await queryInterface.addColumn("service_banks", "rail", {
                type: Sequelize.STRING(255),
                allowNull: true,
                after: "external_type",
            });
        }
    },

    async down(queryInterface) {
        const columns = await queryInterface.describeTable("service_banks");
        if (columns.rail) {
            await queryInterface.removeColumn("service_banks", "rail");
        }
    },
};
