"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("mobile_country_codes", {
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
            country_name: {
                type: Sequelize.STRING(50),
                allowNull: false,
            },
            isd_code: {
                type: Sequelize.STRING(8),
                allowNull: false,
            },
            alpha_2_code: {
                type: Sequelize.STRING(5),
                allowNull: false,
            },
            alpha_3_code: {
                type: Sequelize.STRING(5),
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
        await queryInterface.dropTable("mobile_country_codes");
    },
};
