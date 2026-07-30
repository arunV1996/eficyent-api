"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("merchants", {
            id: {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            unique_id: {
                type: Sequelize.STRING(40),
                allowNull: false,
                unique: true,
            },
            user_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: "users", key: "id" },
                onDelete: "CASCADE",
            },
            name: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            email: {
                type: Sequelize.STRING(255),
                allowNull: false,
                unique: true,
            },
            password: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            api_key: {
                type: Sequelize.TEXT("long"),
                allowNull: true,
            },
            salt_key: {
                type: Sequelize.TEXT("long"),
                allowNull: true,
            },
            private_key: {
                type: Sequelize.TEXT("long"),
                allowNull: true,
            },
            public_key: {
                type: Sequelize.TEXT("long"),
                allowNull: true,
            },
            callback_url: {
                type: Sequelize.TEXT("long"),
                allowNull: true,
            },
            telegram_channel: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            type: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
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
            deleted_at: {
                type: "TIMESTAMP",
                allowNull: true,
            },
        });

        await queryInterface.addIndex("merchants", {
            fields: ["user_id"],
            name: "merchants_user_id_foreign",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("merchants");
    },
};
