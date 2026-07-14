"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("users", "service_providers", {
            type: Sequelize.JSON,
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("users", "service_providers");
    },
};
