"use strict";

/** Entity-panel users (parity with the Laravel entity_users table). */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();
        if (tables.includes("entity_users")) {
            return;
        }
        await queryInterface.createTable("entity_users", {
            id: {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
            },
            unique_id: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true,
            },
            name: {
                type: Sequelize.STRING(25),
                allowNull: false,
            },
            email: {
                type: Sequelize.STRING(50),
                allowNull: false,
                unique: true,
            },
            password: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            entity_ids: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            modules: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            last_password_reset: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            timezone: {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: "Asia/Kolkata",
            },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("entity_users");
    },
};
