"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("wallets", {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: "users",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            currency: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            total: {
                type: Sequelize.DECIMAL(20, 8),
                allowNull: false,
                defaultValue: 0.0,
            },
            remaining: {
                type: Sequelize.DECIMAL(20, 8),
                allowNull: false,
                defaultValue: 0.0,
            },
            onhold: {
                type: Sequelize.DECIMAL(20, 8),
                allowNull: false,
                defaultValue: 0.0,
            },
            used: {
                type: Sequelize.DECIMAL(20, 8),
                allowNull: false,
                defaultValue: 0.0,
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
        await queryInterface.dropTable("wallets");
    },
};
