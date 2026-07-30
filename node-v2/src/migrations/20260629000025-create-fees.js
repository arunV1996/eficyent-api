"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("fees", {
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
            owner_type: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            owner_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
            },
            fee_name: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            fee_type: {
                type: Sequelize.STRING(255),
                allowNull: false,
                defaultValue: "3",
            },
            mode: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            fee_value: {
                type: Sequelize.DECIMAL(15, 6),
                allowNull: false,
            },
            currency_1: {
                type: Sequelize.CHAR(4),
                allowNull: true,
            },
            currency_2: {
                type: Sequelize.CHAR(4),
                allowNull: true,
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

        await queryInterface.addIndex("fees", {
            fields: ["owner_type", "owner_id"],
            name: "fees_owner_type_owner_id_index",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("fees");
    },
};
