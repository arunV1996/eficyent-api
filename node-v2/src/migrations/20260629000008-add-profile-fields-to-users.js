"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("users", "merchant_id", {
            type: Sequelize.BIGINT.UNSIGNED,
            allowNull: true,
        });
        await queryInterface.addColumn("users", "title", {
            type: Sequelize.STRING(5),
            allowNull: true,
        });
        await queryInterface.addColumn("users", "first_name", {
            type: Sequelize.STRING(100),
            allowNull: true,
        });
        await queryInterface.addColumn("users", "middle_name", {
            type: Sequelize.STRING(100),
            allowNull: true,
        });
        await queryInterface.addColumn("users", "last_name", {
            type: Sequelize.STRING(100),
            allowNull: true,
        });
        await queryInterface.addColumn("users", "gender", {
            type: Sequelize.STRING(5),
            allowNull: true,
        });
        await queryInterface.addColumn("users", "dob", {
            type: Sequelize.DATEONLY,
            allowNull: true,
        });
        await queryInterface.addColumn("users", "onboarding_step", {
            type: Sequelize.TINYINT,
            allowNull: false,
            defaultValue: 1,
        });
        await queryInterface.addColumn("users", "id_verification", {
            type: Sequelize.TINYINT,
            allowNull: false,
            defaultValue: 1,
        });
        await queryInterface.addColumn("users", "enable_sender", {
            type: Sequelize.TINYINT,
            allowNull: false,
            defaultValue: 0,
        });
        await queryInterface.addColumn("users", "timezone", {
            type: Sequelize.STRING(30),
            allowNull: false,
            defaultValue: "Asia/Kolkata",
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("users", "merchant_id");
        await queryInterface.removeColumn("users", "title");
        await queryInterface.removeColumn("users", "first_name");
        await queryInterface.removeColumn("users", "middle_name");
        await queryInterface.removeColumn("users", "last_name");
        await queryInterface.removeColumn("users", "gender");
        await queryInterface.removeColumn("users", "dob");
        await queryInterface.removeColumn("users", "onboarding_step");
        await queryInterface.removeColumn("users", "id_verification");
        await queryInterface.removeColumn("users", "enable_sender");
        await queryInterface.removeColumn("users", "timezone");
    },
};
