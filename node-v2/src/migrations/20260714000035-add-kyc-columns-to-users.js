"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("users", "id_verified_by", {
            type: Sequelize.STRING(255),
            allowNull: true,
        });
        await queryInterface.addColumn("users", "id_verification_data", {
            type: Sequelize.JSON,
            allowNull: true,
        });
        await queryInterface.addColumn("users", "deleted_at", {
            type: "TIMESTAMP",
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("users", "id_verified_by");
        await queryInterface.removeColumn("users", "id_verification_data");
        await queryInterface.removeColumn("users", "deleted_at");
    },
};
