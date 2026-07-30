"use strict";

/**
 * Laravel schema parity: creates the framework/admin-panel tables that
 * exist in the Laravel migration set but were never ported to node-v2
 * (queue infrastructure, admin/support/treasury members, callback logs,
 * export files, user settings/alert configurations). Every create is
 * guarded so databases already provisioned by Laravel are untouched.
 * Column shapes are generated from the Laravel migrations verbatim.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableNames = await queryInterface.showAllTables();

        if (!tableNames.includes("accounts_viewers")) {
            await queryInterface.createTable("accounts_viewers", {
                id: {
                    type: "bigint unsigned",
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                unique_id: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                name: {
                    type: "varchar(25)",
                    allowNull: false,
                },
                email: {
                    type: "varchar(50)",
                    allowNull: false,
                },
                password: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                timezone: {
                    type: "varchar(30)",
                    allowNull: false,
                    defaultValue: "Asia/Kolkata",
                },
                status: {
                    type: "tinyint",
                    allowNull: false,
                    defaultValue: 1,
                },
                api_key: {
                    type: "text",
                    allowNull: true,
                },
                salt_key: {
                    type: "text",
                    allowNull: true,
                },
                last_password_reset: {
                    type: "timestamp",
                    allowNull: true,
                },
                created_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                updated_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                deleted_at: {
                    type: "timestamp",
                    allowNull: true,
                },
            });
            await queryInterface.addIndex("accounts_viewers", { fields: ["unique_id"], unique: true });
            await queryInterface.addIndex("accounts_viewers", { fields: ["email"], unique: true });

        }

        if (!tableNames.includes("admins")) {
            await queryInterface.createTable("admins", {
                id: {
                    type: "bigint unsigned",
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                unique_id: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                name: {
                    type: "varchar(25)",
                    allowNull: false,
                },
                email: {
                    type: "varchar(50)",
                    allowNull: false,
                },
                password: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                timezone: {
                    type: "varchar(30)",
                    allowNull: false,
                    defaultValue: "Asia/Kolkata",
                },
                status: {
                    type: "tinyint",
                    allowNull: false,
                    defaultValue: 1,
                },
                last_password_reset: {
                    type: "timestamp",
                    allowNull: true,
                },
                created_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                updated_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                deleted_at: {
                    type: "timestamp",
                    allowNull: true,
                },
            });
            await queryInterface.addIndex("admins", { fields: ["unique_id"], unique: true });
            await queryInterface.addIndex("admins", { fields: ["email"], unique: true });

        }

        if (!tableNames.includes("callback_logs")) {
            await queryInterface.createTable("callback_logs", {
                id: {
                    type: "bigint unsigned",
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                loggable_type: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                loggable_id: {
                    type: "bigint unsigned",
                    allowNull: false,
                },
                logs: {
                    type: "json",
                    allowNull: true,
                },
                created_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                updated_at: {
                    type: "timestamp",
                    allowNull: true,
                },
            });
            await queryInterface.addIndex("callback_logs", { fields: ["loggable_type", "loggable_id"] });

        }

        if (!tableNames.includes("deposit_transactions_accounts")) {
            await queryInterface.createTable("deposit_transactions_accounts", {
                id: {
                    type: "bigint unsigned",
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                unique_id: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                user_id: {
                    type: "bigint unsigned",
                    allowNull: true,
                },
                currency: {
                    type: "varchar(3)",
                    allowNull: false,
                },
                total_amount: {
                    type: "decimal(15,2)",
                    allowNull: false,
                    defaultValue: 0,
                },
                status: {
                    type: "tinyint",
                    allowNull: false,
                    defaultValue: 1,
                },
                created_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                updated_at: {
                    type: "timestamp",
                    allowNull: true,
                },
            });
            await queryInterface.addIndex("deposit_transactions_accounts", { fields: ["unique_id"], unique: true });
            await queryInterface.addIndex("deposit_transactions_accounts", { fields: ["user_id"] });
            await queryInterface.addConstraint("deposit_transactions_accounts", { fields: ["user_id"], type: "foreign key", references: { table: "users", field: "id" }, onDelete: "CASCADE" });
        }

        if (!tableNames.includes("export_files")) {
            await queryInterface.createTable("export_files", {
                id: {
                    type: "bigint unsigned",
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                unique_id: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                type: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                filter: {
                    type: "json",
                    allowNull: true,
                },
                file: {
                    type: "varchar(255)",
                    allowNull: true,
                },
                completed_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                status: {
                    type: "varchar(255)",
                    allowNull: false,
                    defaultValue: 1,
                },
                created_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                updated_at: {
                    type: "timestamp",
                    allowNull: true,
                },
            });
            await queryInterface.addIndex("export_files", { fields: ["unique_id"], unique: true });

        }

        if (!tableNames.includes("failed_jobs")) {
            await queryInterface.createTable("failed_jobs", {
                id: {
                    type: "bigint unsigned",
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                uuid: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                connection: {
                    type: "text",
                    allowNull: false,
                },
                queue: {
                    type: "text",
                    allowNull: false,
                },
                payload: {
                    type: "longtext",
                    allowNull: false,
                },
                exception: {
                    type: "longtext",
                    allowNull: false,
                },
                failed_at: {
                    type: "timestamp",
                    allowNull: false,
                    defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
                },
            });
            await queryInterface.addIndex("failed_jobs", { fields: ["uuid"], unique: true });

        }

        if (!tableNames.includes("job_batches")) {
            await queryInterface.createTable("job_batches", {
                id: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                name: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                total_jobs: {
                    type: "int",
                    allowNull: false,
                },
                pending_jobs: {
                    type: "int",
                    allowNull: false,
                },
                failed_jobs: {
                    type: "int",
                    allowNull: false,
                },
                failed_job_ids: {
                    type: "longtext",
                    allowNull: false,
                },
                options: {
                    type: "mediumtext",
                    allowNull: true,
                },
                cancelled_at: {
                    type: "int",
                    allowNull: true,
                },
                created_at: {
                    type: "int",
                    allowNull: false,
                },
                finished_at: {
                    type: "int",
                    allowNull: true,
                },
            });
            await queryInterface.addConstraint("job_batches", { fields: ["id"], type: "primary key" });


        }

        if (!tableNames.includes("jobs")) {
            await queryInterface.createTable("jobs", {
                id: {
                    type: "bigint unsigned",
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                queue: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                payload: {
                    type: "longtext",
                    allowNull: false,
                },
                attempts: {
                    type: "tinyint unsigned",
                    allowNull: false,
                },
                reserved_at: {
                    type: "int unsigned",
                    allowNull: true,
                },
                available_at: {
                    type: "int unsigned",
                    allowNull: false,
                },
                created_at: {
                    type: "int unsigned",
                    allowNull: false,
                },
            });
            await queryInterface.addIndex("jobs", { fields: ["queue"] });

        }

        if (!tableNames.includes("support_members")) {
            await queryInterface.createTable("support_members", {
                id: {
                    type: "bigint unsigned",
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                unique_id: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                name: {
                    type: "varchar(25)",
                    allowNull: false,
                },
                email: {
                    type: "varchar(50)",
                    allowNull: false,
                },
                password: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                last_password_reset: {
                    type: "timestamp",
                    allowNull: true,
                },
                timezone: {
                    type: "varchar(30)",
                    allowNull: false,
                    defaultValue: "Asia/Kolkata",
                },
                status: {
                    type: "tinyint",
                    allowNull: false,
                    defaultValue: 1,
                },
                created_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                updated_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                deleted_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                modules: {
                    type: "json",
                    allowNull: true,
                },
                mask_data: {
                    type: "tinyint(1)",
                    allowNull: false,
                    defaultValue: 0,
                },
            });
            await queryInterface.addIndex("support_members", { fields: ["unique_id"], unique: true });
            await queryInterface.addIndex("support_members", { fields: ["email"], unique: true });

        }

        if (!tableNames.includes("treasury_members")) {
            await queryInterface.createTable("treasury_members", {
                id: {
                    type: "bigint unsigned",
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                unique_id: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                name: {
                    type: "varchar(25)",
                    allowNull: false,
                },
                email: {
                    type: "varchar(50)",
                    allowNull: false,
                },
                password: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                timezone: {
                    type: "varchar(30)",
                    allowNull: false,
                    defaultValue: "Asia/Kolkata",
                },
                status: {
                    type: "tinyint",
                    allowNull: false,
                    defaultValue: 1,
                },
                last_password_reset: {
                    type: "timestamp",
                    allowNull: true,
                },
                created_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                updated_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                deleted_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                merchants: {
                    type: "json",
                    allowNull: true,
                },
                api_key: {
                    type: "text",
                    allowNull: true,
                },
                salt_key: {
                    type: "text",
                    allowNull: true,
                },
                private_key: {
                    type: "text",
                    allowNull: true,
                },
                public_key: {
                    type: "text",
                    allowNull: true,
                },
            });
            await queryInterface.addIndex("treasury_members", { fields: ["unique_id"], unique: true });
            await queryInterface.addIndex("treasury_members", { fields: ["email"], unique: true });

        }

        if (!tableNames.includes("user_alert_configurations")) {
            await queryInterface.createTable("user_alert_configurations", {
                id: {
                    type: "bigint unsigned",
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                user_id: {
                    type: "bigint unsigned",
                    allowNull: false,
                },
                status: {
                    type: "tinyint",
                    allowNull: false,
                    defaultValue: 1,
                },
                created_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                updated_at: {
                    type: "timestamp",
                    allowNull: true,
                },
            });


        }

        if (!tableNames.includes("user_settings")) {
            await queryInterface.createTable("user_settings", {
                id: {
                    type: "bigint unsigned",
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                unique_id: {
                    type: "varchar(40)",
                    allowNull: false,
                },
                user_id: {
                    type: "bigint unsigned",
                    allowNull: false,
                },
                key: {
                    type: "varchar(255)",
                    allowNull: false,
                },
                value: {
                    type: "text",
                    allowNull: false,
                },
                status: {
                    type: "tinyint",
                    allowNull: false,
                    defaultValue: 1,
                },
                created_at: {
                    type: "timestamp",
                    allowNull: true,
                },
                updated_at: {
                    type: "timestamp",
                    allowNull: true,
                },
            });
            await queryInterface.addIndex("user_settings", { fields: ["unique_id"], unique: true });
            await queryInterface.addIndex("user_settings", { fields: ["user_id"] });
            await queryInterface.addConstraint("user_settings", { fields: ["user_id"], type: "foreign key", references: { table: "users", field: "id" }, onDelete: "CASCADE" });
        }

        // Foreign keys the Laravel migrations declare but the ported
        // creates were missing. Each add is guarded so databases where
        // Laravel already created the constraint are untouched. They
        // run here (after every table exists) to avoid ordering issues.
        const addForeignKeyIfMissing = async (table, column, refTable, onDelete) => {
            const [rows] = await queryInterface.sequelize.query(
                `SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table
                   AND COLUMN_NAME = :column AND REFERENCED_TABLE_NAME IS NOT NULL`,
                { replacements: { table, column } },
            );
            if (rows.length > 0) {
                return;
            }
            await queryInterface.addConstraint(table, {
                fields: [column],
                type: "foreign key",
                // Laravel's constraint naming convention (also keeps
                // identifiers under MySQL's 64-char limit).
                name: `${table}_${column}_foreign`,
                references: { table: refTable, field: "id" },
                onDelete,
            });
        };
        await addForeignKeyIfMissing("beneficiary_accounts", "team_member_id", "team_members", "SET NULL");
        await addForeignKeyIfMissing("beneficiary_transactions", "beneficiary_account_id", "beneficiary_accounts", "RESTRICT");
        await addForeignKeyIfMissing("beneficiary_transactions", "quote_id", "quotes", "RESTRICT");
        await addForeignKeyIfMissing("beneficiary_transactions", "sender_id", "senders", "CASCADE");
        await addForeignKeyIfMissing("beneficiary_transactions", "team_member_id", "team_members", "SET NULL");
        await addForeignKeyIfMissing("deposit_transactions", "admin_wallet_id", "admin_wallets", "RESTRICT");
        await addForeignKeyIfMissing("deposit_transactions", "team_member_id", "team_members", "SET NULL");
        await addForeignKeyIfMissing("external_service_calls", "beneficiary_transaction_id", "beneficiary_transactions", "CASCADE");
        await addForeignKeyIfMissing("ledgers", "refund_ledger_id", "ledgers", "SET NULL");
        await addForeignKeyIfMissing("ledgers", "virtual_account_id", "virtual_accounts", "CASCADE");
        await addForeignKeyIfMissing("quotes", "beneficiary_account_id", "beneficiary_accounts", "CASCADE");
        await addForeignKeyIfMissing("quotes", "virtual_account_id", "virtual_accounts", "CASCADE");
        await addForeignKeyIfMissing("senders", "team_member_id", "team_members", "SET NULL");
        await addForeignKeyIfMissing("users", "business_user_id", "users", "SET NULL");
        await addForeignKeyIfMissing("users", "merchant_id", "merchants", "CASCADE");
        await addForeignKeyIfMissing("wallet_transactions", "beneficiary_transaction_id", "beneficiary_transactions", "RESTRICT");
        await addForeignKeyIfMissing("wallet_transactions", "quote_id", "quotes", "RESTRICT");
        await addForeignKeyIfMissing("wallet_transactions", "user_id", "users", "RESTRICT");
    },

    async down(queryInterface) {
        // Drop the foreign keys added in up() (tolerate absence — on
        // Laravel-provisioned databases up() never created them).
        await queryInterface
            .removeConstraint("beneficiary_accounts", "beneficiary_accounts_team_member_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("beneficiary_transactions", "beneficiary_transactions_beneficiary_account_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("beneficiary_transactions", "beneficiary_transactions_quote_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("beneficiary_transactions", "beneficiary_transactions_sender_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("beneficiary_transactions", "beneficiary_transactions_team_member_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("deposit_transactions", "deposit_transactions_admin_wallet_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("deposit_transactions", "deposit_transactions_team_member_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("external_service_calls", "external_service_calls_beneficiary_transaction_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("ledgers", "ledgers_refund_ledger_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("ledgers", "ledgers_virtual_account_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("quotes", "quotes_beneficiary_account_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("quotes", "quotes_virtual_account_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("senders", "senders_team_member_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("users", "users_business_user_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("users", "users_merchant_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("wallet_transactions", "wallet_transactions_beneficiary_transaction_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("wallet_transactions", "wallet_transactions_quote_id_foreign")
            .catch(() => undefined);
        await queryInterface
            .removeConstraint("wallet_transactions", "wallet_transactions_user_id_foreign")
            .catch(() => undefined);
        for (const table of ["accounts_viewers", "admins", "callback_logs", "deposit_transactions_accounts", "export_files", "failed_jobs", "job_batches", "jobs", "support_members", "treasury_members", "user_alert_configurations", "user_settings"].reverse()) {
            await queryInterface.dropTable(table, { cascade: true }).catch(() => undefined);
        }
    },
};
