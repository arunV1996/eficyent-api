"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("currencies", {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            code: {
                type: Sequelize.STRING(10),
                allowNull: false,
                unique: true,
            },
            name: {
                type: Sequelize.STRING(50),
                allowNull: false,
            },
            type: {
                type: Sequelize.ENUM("fiat", "crypto"),
                allowNull: false,
            },
            status: {
                type: Sequelize.ENUM("active", "inactive"),
                allowNull: false,
                defaultValue: "active",
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable("currencies");
    },
};
