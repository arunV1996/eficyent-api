"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("user_documents", {
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
            document_name: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },
            document_type: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },
            document_country: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },
            document_file: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            document_back_file: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            document_expiry_date: {
                type: Sequelize.DATEONLY,
                allowNull: true,
            },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            verified_at: {
                type: "TIMESTAMP",
                allowNull: true,
            },
            remarks: {
                type: Sequelize.TEXT,
                allowNull: true,
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

        await queryInterface.addIndex("user_documents", {
            fields: ["user_id"],
            name: "user_documents_user_id_foreign",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("user_documents");
    },
};
