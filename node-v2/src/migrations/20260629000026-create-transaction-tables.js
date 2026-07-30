"use strict";

/**
 * Creates the six transaction-substrate tables in one migration:
 * beneficiary_transactions, beneficiary_transaction_status_histories,
 * ledgers, wallet_transactions, payout_jobs, deposit_transactions.
 * Column shapes mirror the legacy Prisma schema.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const id = {
            type: Sequelize.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
            allowNull: false,
        };
        const uniqueId = {
            type: Sequelize.STRING(255),
            allowNull: false,
            unique: true,
        };
        const timestamps = {
            created_at: {
                type: "TIMESTAMP",
                allowNull: true,
            },
            updated_at: { type: "TIMESTAMP", allowNull: true },
        };
        const str = { type: Sequelize.STRING(255), allowNull: true };
        const bigintNullable = {
            type: Sequelize.BIGINT.UNSIGNED,
            allowNull: true,
        };
        const money2 = (allowNull = false) => ({
            type: Sequelize.DECIMAL(15, 2),
            allowNull,
            defaultValue: allowNull ? undefined : 0,
        });

        await queryInterface.createTable("beneficiary_transactions", {
            id,
            unique_id: uniqueId,
            txn_ref_no: { ...str, unique: true },
            order_id: str,
            user_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: "users", key: "id" },
                onDelete: "CASCADE",
            },
            team_member_id: bigintNullable,
            sender_id: bigintNullable,
            beneficiary_account_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
            },
            quote_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
            },
            amount: money2(),
            total_amount: money2(),
            commission_amount: money2(),
            recipient_amount: money2(),
            receiving_currency: { type: Sequelize.STRING(5), allowNull: true },
            rail: str,
            external_type: {
                type: Sequelize.STRING(255),
                allowNull: false,
                defaultValue: "ec",
            },
            external_status: str,
            external_remarks: { type: Sequelize.TEXT, allowNull: true },
            is_service_called: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: 0,
            },
            service_mid: str,
            external_reference_id: str,
            external_data: { type: Sequelize.JSON, allowNull: true },
            purpose_of_payment: str,
            supporting_document: str,
            client_reference_id: str,
            remarks: { type: Sequelize.TEXT, allowNull: true },
            notes: { type: Sequelize.TEXT, allowNull: true },
            compliance_data: { type: Sequelize.JSON, allowNull: true },
            compliance_status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 0,
            },
            compliance_notes: str,
            remittance_data: { type: Sequelize.JSON, allowNull: true },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 0,
            },
            ...timestamps,
        });
        await queryInterface.addIndex("beneficiary_transactions", {
            fields: ["external_reference_id"],
        });
        await queryInterface.addIndex("beneficiary_transactions", {
            fields: ["user_id", "status", "unique_id"],
        });

        await queryInterface.createTable(
            "beneficiary_transaction_status_histories",
            {
                id,
                unique_id: uniqueId,
                beneficiary_transaction_id: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: false,
                    references: {
                        model: "beneficiary_transactions",
                        key: "id",
                    },
                    onDelete: "CASCADE",
                },
                from_status: str,
                to_status: { type: Sequelize.STRING(255), allowNull: false },
                changed_by: str,
                changed_by_type: str,
                changed_at: { type: "TIMESTAMP", allowNull: false },
                meta: { type: Sequelize.JSON, allowNull: true },
                ...timestamps,
            },
        );

        await queryInterface.createTable("ledgers", {
            id,
            unique_id: uniqueId,
            user_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: "users", key: "id" },
                onDelete: "CASCADE",
            },
            virtual_account_id: bigintNullable,
            wallet_id: bigintNullable,
            transaction_type: str,
            transaction_id: bigintNullable,
            balance: money2(),
            external_type: str,
            description: { type: Sequelize.TEXT, allowNull: true },
            refund_ledger_id: bigintNullable,
            ...timestamps,
        });
        await queryInterface.addIndex("ledgers", {
            fields: ["user_id", "virtual_account_id"],
        });

        await queryInterface.createTable("wallet_transactions", {
            id,
            unique_id: uniqueId,
            user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
            wallet_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: "wallets", key: "id" },
                onDelete: "CASCADE",
            },
            quote_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
            },
            beneficiary_transaction_id: bigintNullable,
            amount: money2(),
            fees: money2(),
            total_amount: money2(),
            type: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            balance_before: money2(true),
            balance_after: money2(true),
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 0,
            },
            ...timestamps,
        });
        await queryInterface.addIndex("wallet_transactions", {
            fields: ["beneficiary_transaction_id"],
            name: "wallet_transactions_beneficiary_transaction_id_index",
        });

        await queryInterface.createTable("payout_jobs", {
            id,
            unique_id: uniqueId,
            batch_id: str,
            row_number: { type: Sequelize.INTEGER, allowNull: true },
            beneficiary_transaction_id: bigintNullable,
            user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
            amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 0,
            },
            attempts: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            error_message: { type: Sequelize.TEXT, allowNull: true },
            payload: { type: Sequelize.JSON, allowNull: false },
            ...timestamps,
        });
        await queryInterface.addIndex("payout_jobs", {
            fields: ["created_at"],
        });

        await queryInterface.createTable("deposit_transactions", {
            id,
            unique_id: uniqueId,
            user_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: "users", key: "id" },
                onDelete: "CASCADE",
            },
            team_member_id: bigintNullable,
            virtual_account_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: "virtual_accounts", key: "id" },
                onDelete: "CASCADE",
            },
            admin_wallet_id: bigintNullable,
            amount: money2(),
            commission_amount: money2(),
            external_commission_amount: money2(),
            merchant_commission_amount: money2(),
            total_commission_amount: money2(),
            total_amount: money2(),
            deposit_currency: { type: Sequelize.STRING(10), allowNull: true },
            from_wallet_address: str,
            transaction_hash: str,
            memo: str,
            external_type: str,
            external_reference_id: str,
            external_data: { type: Sequelize.JSON, allowNull: true },
            external_status: str,
            external_remarks: { type: Sequelize.TEXT, allowNull: true },
            remarks: { type: Sequelize.TEXT, allowNull: true },
            client_reference_id: str,
            status: {
                type: Sequelize.TINYINT,
                allowNull: false,
                defaultValue: 0,
            },
            type: {
                type: Sequelize.STRING(255),
                allowNull: false,
                defaultValue: "deposit",
            },
            purpose_of_payment: str,
            source_of_funds: str,
            proof: str,
            ...timestamps,
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("deposit_transactions");
        await queryInterface.dropTable("payout_jobs");
        await queryInterface.dropTable("wallet_transactions");
        await queryInterface.dropTable("ledgers");
        await queryInterface.dropTable(
            "beneficiary_transaction_status_histories",
        );
        await queryInterface.dropTable("beneficiary_transactions");
    },
};
