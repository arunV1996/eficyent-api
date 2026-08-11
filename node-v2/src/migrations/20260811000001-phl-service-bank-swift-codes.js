"use strict";

/**
 * Philippine service_banks directory refresh: bank_id previously held
 * legacy internal slugs; the provider now addresses PHL banks by their
 * official SWIFT/BIC, so bank_id is updated to the official code for
 * the affected banks (matched case-insensitively by bank name, PHL
 * rows only).
 *
 * Data migration — the legacy slugs are environment-specific, so down
 * is a no-op.
 */

const PHL_BANK_SWIFT_CODES = {
    "ALL BANK": "ALLBP2M1XXX",
    "BANK OF CHINA": "BKCHPHMMXXX",
    "BDO UNIBANK INC": "BNORPHMMXXX",
    BPI: "BOPIPHMMXXX",
    "CIMB BANK": "CIMBPHMMXXX",
};

module.exports = {
    async up(queryInterface) {
        for (const [bankName, swiftCode] of Object.entries(
            PHL_BANK_SWIFT_CODES,
        )) {
            await queryInterface.sequelize.query(
                "UPDATE service_banks SET bank_id = :swiftCode " +
                    "WHERE country = 'PHL' AND LOWER(bank_name) = :bankName",
                {
                    replacements: {
                        swiftCode,
                        bankName: bankName.toLowerCase(),
                    },
                },
            );
        }
    },

    async down() {
        // Irreversible data fix: the previous bank_id slugs are not
        // recorded anywhere recoverable.
    },
};
