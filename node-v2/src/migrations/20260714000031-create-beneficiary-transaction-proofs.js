"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("beneficiary_transaction_proofs", {
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
            beneficiary_transaction_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: "beneficiary_transactions", key: "id" },
                onDelete: "CASCADE",
            },
            document_type: { type: Sequelize.STRING(255), allowNull: false },
            remitter_proof: { type: Sequelize.TEXT, allowNull: true },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            file_url: { type: Sequelize.TEXT, allowNull: true },
            requested_at: { type: "TIMESTAMP", allowNull: true },
            uploaded_at: { type: "TIMESTAMP", allowNull: true },
            created_at: { type: "TIMESTAMP", allowNull: true },
            updated_at: { type: "TIMESTAMP", allowNull: true },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("beneficiary_transaction_proofs");
    },
};
