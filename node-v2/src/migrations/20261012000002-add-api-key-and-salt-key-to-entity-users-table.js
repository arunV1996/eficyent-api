"use strict";
module.exports = {
    async up(queryInterface, Sequelize) {
        const columns = await queryInterface.describeTable("entity_users");
        if (!columns.api_key) {
            await queryInterface.addColumn("entity_users", "api_key", {
                type: Sequelize.TEXT("long"),
                allowNull: true,
                after: "access_token",
            });
        }
        if (!columns.salt_key) {
            await queryInterface.addColumn("entity_users", "salt_key", {
                type: Sequelize.TEXT("long"),
                allowNull: true,
                after: "api_key",
            });
        }
    },
    async down(queryInterface) {
        const columns = await queryInterface.describeTable("entity_users");
        if (columns.salt_key) {
            await queryInterface.removeColumn("entity_users", "salt_key");
        }
        if (columns.api_key) {
            await queryInterface.removeColumn("entity_users", "api_key");
        }
    },
};
