"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("user_services", {
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
            user_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: "users", key: "id" },
                onDelete: "CASCADE",
            },
            service_type: { type: Sequelize.STRING(255), allowNull: false },
            external_reference_id: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            external_data: { type: Sequelize.JSON, allowNull: true },
            external_status: { type: Sequelize.STRING(255), allowNull: true },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            is_active: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            created_at: { type: Sequelize.DATE, allowNull: true },
            updated_at: { type: Sequelize.DATE, allowNull: true },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("user_services");
    },
};
