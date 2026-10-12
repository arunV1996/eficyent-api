"use strict";
module.exports = {
    async up(queryInterface, Sequelize) {
        const columns = await queryInterface.describeTable("entity_users");
        if (!columns.access_token) {
            await queryInterface.addColumn("entity_users", "access_token", {
                type: Sequelize.TEXT("long"),
                allowNull: true,
                after: "password",
            });
        }
    },
    async down(queryInterface) {
        const columns = await queryInterface.describeTable("entity_users");
        if (columns.access_token) {
            await queryInterface.removeColumn("entity_users", "access_token");
        }
    },
};
