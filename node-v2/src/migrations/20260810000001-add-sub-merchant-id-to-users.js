"use strict";

/**
 * Whitelabel sub-merchant support: users.sub_merchant_id references the
 * merchant a whitelabel parent resolves the user to (parent merchant of
 * type WHITELABEL + sub merchant set -> the sub merchant is the user's
 * effective merchant).
 *
 * Also adds lookup indexes on sub_merchant_id in the related tables
 * (beneficiary_accounts, senders, beneficiary_transactions) — but only
 * where that column actually exists, so environments without the
 * Laravel-side columns are untouched.
 *
 * Everything is guarded (column/index/FK existence checks) to stay
 * compatible with databases already migrated from the Laravel side.
 */

const FOREIGN_KEY_NAME = "users_sub_merchant_id_foreign";
const RELATED_TABLES = [
    "beneficiary_accounts",
    "senders",
    "beneficiary_transactions",
];

const indexName = (tableName) => `${tableName}_sub_merchant_id_index`;

const hasIndex = async (queryInterface, tableName, name) => {
    const indexes = await queryInterface.showIndex(tableName);
    return indexes.some((index) => index.name === name);
};

const hasForeignKey = async (queryInterface, tableName, name) => {
    const references =
        await queryInterface.getForeignKeyReferencesForTable(tableName);
    return references.some(
        (reference) => reference.constraintName === name,
    );
};

module.exports = {
    async up(queryInterface, Sequelize) {
        const usersTable = await queryInterface.describeTable("users");
        if (!usersTable.sub_merchant_id) {
            await queryInterface.addColumn("users", "sub_merchant_id", {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true,
                after: "merchant_id",
            });
        }

        if (!(await hasForeignKey(queryInterface, "users", FOREIGN_KEY_NAME))) {
            await queryInterface.addConstraint("users", {
                fields: ["sub_merchant_id"],
                type: "foreign key",
                name: FOREIGN_KEY_NAME,
                references: { table: "merchants", field: "id" },
                onDelete: "CASCADE",
                onUpdate: "RESTRICT",
            });
        }

        // The FK above already gives users.sub_merchant_id an index in
        // MySQL; the related tables get an explicit lookup index when
        // they carry the column.
        for (const tableName of RELATED_TABLES) {
            const table = await queryInterface.describeTable(tableName);
            if (!table.sub_merchant_id) {
                continue;
            }
            if (
                !(await hasIndex(queryInterface, tableName, indexName(tableName)))
            ) {
                await queryInterface.addIndex(tableName, {
                    fields: ["sub_merchant_id"],
                    name: indexName(tableName),
                });
            }
        }
    },

    async down(queryInterface) {
        for (const tableName of RELATED_TABLES) {
            if (
                await hasIndex(queryInterface, tableName, indexName(tableName))
            ) {
                await queryInterface.removeIndex(
                    tableName,
                    indexName(tableName),
                );
            }
        }

        if (await hasForeignKey(queryInterface, "users", FOREIGN_KEY_NAME)) {
            await queryInterface.removeConstraint("users", FOREIGN_KEY_NAME);
        }

        const usersTable = await queryInterface.describeTable("users");
        if (usersTable.sub_merchant_id) {
            await queryInterface.removeColumn("users", "sub_merchant_id");
        }
    },
};
