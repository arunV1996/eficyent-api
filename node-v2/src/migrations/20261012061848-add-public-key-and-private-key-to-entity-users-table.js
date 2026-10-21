"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        const columns = await queryInterface.describeTable("entity_users");
        if (!columns.public_key) {
            await queryInterface.addColumn("entity_users", "public_key", {
                type: Sequelize.TEXT("long"),
                allowNull: true,
                after: "salt_key",
            });
        }
        if (!columns.private_key) {
            await queryInterface.addColumn("entity_users", "private_key", {
                type: Sequelize.TEXT("long"),
                allowNull: true,
                after: "public_key",
            });
        }
    },

    async down(queryInterface) {
        const columns = await queryInterface.describeTable("entity_users");
        if (columns.private_key) {
            await queryInterface.removeColumn("entity_users", "private_key");
        }
        if (columns.public_key) {
            await queryInterface.removeColumn("entity_users", "public_key");
        }
    },
};
