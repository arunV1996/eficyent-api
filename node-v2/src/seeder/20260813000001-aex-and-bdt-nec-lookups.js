"use strict";
const { randomUUID } = require("crypto");
const AEX_PURPOSES = [
    { key: "Family Support", value: "Family Support" },
    { key: "Education", value: "Education" },
    { key: "Medical", value: "Medical" },
    { key: "Travel", value: "Travel" },
    { key: "Investment", value: "Investment" },
    { key: "Trade/Business", value: "Trade/Business" },
    { key: "Savings", value: "Savings" },
    { key: "Gifts/Donations", value: "Gifts/Donations" },
    { key: "Other", value: "Other" },
];
const AEX_ID_TYPES = [
    { key: "Passport", value: "Passport" },
    { key: "National ID", value: "National ID" },
    { key: "Driver License", value: "Driver License" },
    { key: "Residence Permit", value: "Residence Permit" },
    { key: "Voter ID", value: "Voter ID" },
    { key: "Tax ID", value: "Tax ID" },
    { key: "Other", value: "Other" },
];
const AEX_FUNDS = [
    { key: "Salary/Wages", value: "Salary/Wages" },
    { key: "Business Profits", value: "Business Profits" },
    { key: "Savings/Investments", value: "Savings/Investments" },
    { key: "Inheritance/Gift", value: "Inheritance/Gift" },
    { key: "Sale of Assets", value: "Sale of Assets" },
    { key: "Loan/Credit", value: "Loan/Credit" },
    { key: "Other", value: "Other" },
];
const BDT_NEC_BANKS = [
    { bank_id: "ABBL", bank_name: "AB Bank Limited", iso_code: "ABBLBDDH" },
    { bank_id: "ABL", bank_name: "Agrani Bank Limited", iso_code: "AGBKBDDH" },
    { bank_id: "ALBL", bank_name: "Al-Arafah Islami Bank Limited", iso_code: "ALADBDDH" },
    { bank_id: "BBL", bank_name: "BRAC Bank Limited", iso_code: "BRACBDDH" },
    { bank_id: "CBL", bank_name: "City Bank Limited", iso_code: "CITIBDDH" },
    { bank_id: "DBBL", bank_name: "Dutch-Bangla Bank Limited", iso_code: "DBBLBDDH" },
    { bank_id: "EBL", bank_name: "Eastern Bank Limited", iso_code: "EBLBDDH" },
    { bank_id: "EXIM", bank_name: "EXIM Bank Limited", iso_code: "EXIMBDDH" },
    { bank_id: "FSIBL", bank_name: "First Security Islami Bank Limited", iso_code: "FSIBLBDDH" },
    { bank_id: "IBBL", bank_name: "Islami Bank Bangladesh Limited", iso_code: "IBBLBDDH" },
    { bank_id: "JBL", bank_name: "Janata Bank Limited", iso_code: "JANABDDH" },
    { bank_id: "MTBL", bank_name: "Mutual Trust Bank Limited", iso_code: "MTBLBDDH" },
    { bank_id: "NCCB", bank_name: "NCC Bank Limited", iso_code: "NCCBBDDH" },
    { bank_id: "NRB", bank_name: "NRB Bank Limited", iso_code: "NRBBBDDH" },
    { bank_id: "PBL", bank_name: "Prime Bank Limited", iso_code: "PRMEBDDH" },
    { bank_id: "PUB", bank_name: "Pubali Bank Limited", iso_code: "PUBABDDH" },
    { bank_id: "RBL", bank_name: "Rupali Bank Limited", iso_code: "RUPABDDH" },
    { bank_id: "SBL", bank_name: "Sonali Bank Limited", iso_code: "BSONBDDH" },
    { bank_id: "SIBL", bank_name: "Social Islami Bank Limited", iso_code: "SOIBBDDH" },
    { bank_id: "SEBL", bank_name: "Southeast Bank Limited", iso_code: "SEBDBDDH" },
    { bank_id: "UCBL", bank_name: "United Commercial Bank Limited", iso_code: "UCBLBDDH" },
    { bank_id: "UBL", bank_name: "Uttara Bank Limited", iso_code: "UTTABDDH" },
];
module.exports = {
    async up(queryInterface) {
        const seedLookups = async (items, type) => {
            for (const item of items) {
                const [existing] = await queryInterface.sequelize.query(
                    "SELECT id FROM lookups WHERE `key` = :key AND type = :type AND external_type = 'aex' LIMIT 1",
                    { replacements: { key: item.key, type } }
                );
                if (existing.length === 0) {
                    await queryInterface.sequelize.query(
                        "INSERT INTO lookups (unique_id, `key`, value, type, external_type, status, created_at, updated_at) " +
                            "VALUES (:uniqueId, :key, :value, :type, 'aex', 1, NOW(), NOW())",
                        {
                            replacements: {
                                uniqueId: randomUUID(),
                                key: item.key,
                                value: item.value,
                                type,
                            },
                        }
                    );
                }
            }
        };
        await seedLookups(AEX_PURPOSES, "purpose_of_transactions");
        await seedLookups(AEX_ID_TYPES, "id_types");
        await seedLookups(AEX_FUNDS, "source_of_funds");
        for (const bank of BDT_NEC_BANKS) {
            const [existing] = await queryInterface.sequelize.query(
                "SELECT id FROM service_banks WHERE bank_id = :bankId AND external_type = 'nec' LIMIT 1",
                { replacements: { bankId: bank.bank_id } }
            );
            if (existing.length === 0) {
                await queryInterface.sequelize.query(
                    "INSERT INTO service_banks (unique_id, bank_id, bank_name, iso_code, country, currency, external_type, status, created_at, updated_at) " +
                        "VALUES (:uniqueId, :bankId, :bankName, :isoCode, 'BGD', 'BDT', 'nec', '1', NOW(), NOW())",
                    {
                        replacements: {
                            uniqueId: randomUUID(),
                            bankId: bank.bank_id,
                            bankName: bank.bank_name,
                            isoCode: bank.iso_code,
                        },
                    }
                );
            }
        }
    },
    async down(queryInterface) {
        await queryInterface.sequelize.query("DELETE FROM lookups WHERE external_type = 'aex'");
        await queryInterface.sequelize.query("DELETE FROM service_banks WHERE external_type = 'nec' AND country = 'BGD'");
    },
};
