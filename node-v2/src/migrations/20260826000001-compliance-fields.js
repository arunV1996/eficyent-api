"use strict";

/**
 * Extended compliance fields for the ARE/CHN corridors: sender ID
 * issuance details + profession, and the beneficiary relationship.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const senderColumns = await queryInterface.describeTable("senders");
        if (!senderColumns.id_issued_country) {
            await queryInterface.addColumn("senders", "id_issued_country", {
                type: Sequelize.STRING(255),
                allowNull: true,
                after: "id_number",
            });
        }
        if (!senderColumns.id_issued_date) {
            await queryInterface.addColumn("senders", "id_issued_date", {
                type: Sequelize.DATEONLY,
                allowNull: true,
                after: "id_issued_country",
            });
        }
        if (!senderColumns.id_expiry_date) {
            await queryInterface.addColumn("senders", "id_expiry_date", {
                type: Sequelize.DATEONLY,
                allowNull: true,
                after: "id_issued_date",
            });
        }
        if (!senderColumns.profession) {
            await queryInterface.addColumn("senders", "profession", {
                type: Sequelize.STRING(255),
                allowNull: true,
                after: "id_expiry_date",
            });
        }

        const beneficiaryColumns = await queryInterface.describeTable(
            "beneficiary_accounts",
        );
        if (!beneficiaryColumns.relationship) {
            await queryInterface.addColumn(
                "beneficiary_accounts",
                "relationship",
                {
                    type: Sequelize.STRING(255),
                    allowNull: true,
                    after: "external_data",
                },
            );
        }
    },

    async down(queryInterface) {
        const senderColumns = await queryInterface.describeTable("senders");
        for (const column of [
            "id_issued_country",
            "id_issued_date",
            "id_expiry_date",
            "profession",
        ]) {
            if (senderColumns[column]) {
                await queryInterface.removeColumn("senders", column);
            }
        }
        const beneficiaryColumns = await queryInterface.describeTable(
            "beneficiary_accounts",
        );
        if (beneficiaryColumns.relationship) {
            await queryInterface.removeColumn(
                "beneficiary_accounts",
                "relationship",
            );
        }
    },
};
