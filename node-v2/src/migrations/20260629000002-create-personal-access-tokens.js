"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("personal_access_tokens", {
            id: {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            tokenable_type: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            tokenable_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
            },
            name: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            token: {
                type: Sequelize.STRING(64),
                allowNull: false,
                unique: true,
            },
            abilities: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            last_used_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            expires_at: {
                type: Sequelize.DATE,
                allowNull: true,
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

        await queryInterface.addIndex("personal_access_tokens", {
            fields: ["tokenable_type", "tokenable_id"],
            name: "personal_access_tokens_tokenable_type_tokenable_id_index",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("personal_access_tokens");
    },
};
