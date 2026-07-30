"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("states", {
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
            name: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            country_code: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            country_alpha3: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            state_code: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            status: {
                type: Sequelize.TINYINT,
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
    },

    async down(queryInterface) {
        await queryInterface.dropTable("states");
    },
};
