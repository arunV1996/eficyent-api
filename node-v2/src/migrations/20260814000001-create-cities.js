"use strict";

/**
 * Cities directory backing the dynamic city dropdowns: when a country
 * has seeded cities, address forms render a city dropdown instead of
 * the free-text input. Guarded so environments where the table already
 * exists are untouched.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();
        if (tables.includes("cities")) {
            return;
        }
        await queryInterface.createTable("cities", {
            id: {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            unique_id: {
                type: Sequelize.STRING(255),
                allowNull: false,
                unique: true,
            },
            city: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            state: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            country: {
                type: Sequelize.STRING(3),
                allowNull: false,
            },
            external_type: {
                type: Sequelize.STRING(11),
                allowNull: false,
                defaultValue: "EPF",
            },
            status: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 1,
            },
            created_at: {
                type: "TIMESTAMP",
                allowNull: true,
            },
            updated_at: {
                type: "TIMESTAMP",
                allowNull: true,
            },
        });
        await queryInterface.addIndex("cities", {
            fields: ["country"],
            name: "cities_country_index",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("cities");
    },
};
