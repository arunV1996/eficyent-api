"use strict";

/**
 * CoinPH ("ecp") Philippine bank + e-wallet directory (mirror of the
 * Laravel PHPBankSeeder). Upsert semantics per entry:
 *
 *   - a service_banks row matching (bank_name case-insensitively,
 *     external_type = 'ecp') gets its iso_code updated to the official
 *     SWIFT/BIC;
 *   - otherwise a fresh row is inserted: UUID unique_id, cleaned
 *     alphanumeric bank_id derived from the bank name, iso_code =
 *     SWIFT, country PHL, currency PHP, external_type ecp, status 1.
 *
 * PHL_COINPH_BANKS is the verbatim data table from PHPBankSeeder —
 * extend it entry-by-entry as the upstream list grows; the upsert is
 * idempotent so re-running after additions is safe.
 *
 * Down removes only rows this migration could have inserted (ecp +
 * PHL + listed name) and never touches other providers' directories.
 */

const { randomUUID } = require("crypto");

// bank_name -> official SWIFT/BIC. Mirror of PHPBankSeeder.php.
const PHL_COINPH_BANKS = {
    "ALL BANK": "ALLBP2M1XXX",
    "BANK OF CHINA": "BKCHPHMMXXX",
    "BDO UNIBANK INC": "BNORPHMMXXX",
    BPI: "BOPIPHMMXXX",
    "CIMB BANK": "CIMBPHMMXXX",
};

/** "BDO UNIBANK INC" -> "BDOUNIBANKINC" (cleaned alphanumeric code). */
const cleanBankId = (bankName) =>
    String(bankName)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

module.exports = {
    async up(queryInterface) {
        for (const [bankName, swiftCode] of Object.entries(
            PHL_COINPH_BANKS,
        )) {
            const [existingRows] = await queryInterface.sequelize.query(
                "SELECT id FROM service_banks " +
                    "WHERE LOWER(bank_name) = :bankName AND external_type = 'ecp' " +
                    "LIMIT 1",
                { replacements: { bankName: bankName.toLowerCase() } },
            );

            if (existingRows.length > 0) {
                await queryInterface.sequelize.query(
                    "UPDATE service_banks SET iso_code = :swiftCode, updated_at = NOW() " +
                        "WHERE id = :id",
                    {
                        replacements: {
                            swiftCode,
                            id: existingRows[0].id,
                        },
                    },
                );
                continue;
            }

            // bank_id is globally unique — skip the insert rather than
            // fail the whole run if another provider already claimed
            // the cleaned code.
            const bankId = cleanBankId(bankName);
            const [bankIdRows] = await queryInterface.sequelize.query(
                "SELECT id FROM service_banks WHERE bank_id = :bankId LIMIT 1",
                { replacements: { bankId } },
            );
            if (bankIdRows.length > 0) {
                continue;
            }

            await queryInterface.sequelize.query(
                "INSERT INTO service_banks " +
                    "(unique_id, bank_id, bank_name, iso_code, country, currency, external_type, status, created_at, updated_at) " +
                    "VALUES (:uniqueId, :bankId, :bankName, :swiftCode, 'PHL', 'PHP', 'ecp', '1', NOW(), NOW())",
                {
                    replacements: {
                        uniqueId: randomUUID(),
                        bankId,
                        bankName,
                        swiftCode,
                    },
                },
            );
        }
    },

    async down(queryInterface) {
        for (const bankName of Object.keys(PHL_COINPH_BANKS)) {
            await queryInterface.sequelize.query(
                "DELETE FROM service_banks " +
                    "WHERE LOWER(bank_name) = :bankName " +
                    "AND external_type = 'ecp' AND country = 'PHL'",
                { replacements: { bankName: bankName.toLowerCase() } },
            );
        }
    },
};
