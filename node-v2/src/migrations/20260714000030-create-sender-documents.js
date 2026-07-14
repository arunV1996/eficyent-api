"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("sender_documents", {
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
            sender_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: "senders", key: "id" },
                onDelete: "CASCADE",
            },
            document_name: { type: Sequelize.STRING(100), allowNull: true },
            document_type: { type: Sequelize.STRING(100), allowNull: true },
            document_country: { type: Sequelize.STRING(100), allowNull: true },
            document_file: { type: Sequelize.STRING(255), allowNull: true },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            verified_at: { type: Sequelize.DATE, allowNull: true },
            remarks: { type: Sequelize.TEXT, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: true },
            updated_at: { type: Sequelize.DATE, allowNull: true },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("sender_documents");
    },
};
