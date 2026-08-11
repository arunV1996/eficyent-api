"use strict";

/**
 * CoinPH ("ecp") Philippine bank + e-wallet directory (mirror of the
 * Laravel PHPBankSeeder). Upsert semantics per entry:
 *
 *   - a service_banks row matching (bank_name case-insensitively,
 *     external_type = 'ecp') gets its iso_code updated to the official
 *     SWIFT/BIC (NULL for the e-wallets that have none);
 *   - otherwise a fresh row is inserted: UUID unique_id, bank_id =
 *     the provider code cleaned to alphanumerics, iso_code = SWIFT,
 *     country PHL, currency PHP, external_type ecp, status 1.
 *
 * bank_id is globally unique (same constraint as the Laravel schema),
 * and the seeder data deliberately carries alias entries sharing one
 * provider code (e.g. BPI / BANK OF THE PHILIPPINE ISLANDS -> 'bpi'),
 * so an insert whose bank_id is already claimed is skipped instead of
 * failing the run — the first entry with each code owns the row.
 *
 * Idempotent; down removes only rows this migration could have
 * inserted (ecp + PHL + listed name).
 */

const { randomUUID } = require("crypto");

// Verbatim data table from PHPBankSeeder.php.
const PHP_BANKS_SEEDER_DATA = [
    { name: "ALL BANK", code: "allbank", swift_code: "ALKBPHM2" },
    { name: "Asenso", code: "guinobatan", swift_code: null },
    { name: "8", code: "aub", swift_code: "AUBKPHMM" },
    { name: "BananaPay", code: "bananapay", swift_code: null },
    { name: "BANGKO MABUHAY", code: "bangkomabuhay", swift_code: "MRTCPHM1" },
    { name: "BANK OF CHINA", code: "bankofchina", swift_code: "BKCHPHMM" },
    { name: "BANK OF COMMERCE", code: "bankofcommerce", swift_code: "PABIPHMM" },
    { name: "BPI DIRECT BANKO", code: "bpi", swift_code: "BPDIPHM1" },
    { name: "BDO UNIBANK INC", code: "bdouni", swift_code: "BNORPHMM" },
    { name: "BDO NETWORK BANK", code: "bdo", swift_code: "ONNRPHM1" },
    { name: "BINANGONAN RURAL BANK", code: "binangonan", swift_code: "BIUUPHM1" },
    { name: "BPI", code: "bpi", swift_code: "BOPIPHMM" },
    { name: "CAMALIG BANK", code: "camalig", swift_code: "RUCAPHM1" },
    { name: "CANTILAN BANK", code: "cantilan", swift_code: "CNRLPHM1" },
    { name: "CARD BANK", code: "cardbank", swift_code: "CBMFPHM1" },
    { name: "CARD SME Bank", code: "sme", swift_code: "CRMHPHM1" },
    { name: "CEBUANA LHUILLIER", code: "cebuanal", swift_code: "CELRPHM1" },
    { name: "CHINA BANKING CORPORATION", code: "chinabank", swift_code: "CHBKPHMM" },
    { name: "CHINA BANK SAVINGS", code: "chinabanksavings", swift_code: "CHSVPHM1" },
    { name: "CIMB BANK", code: "cimb", swift_code: "CIPHPHMM" },
    { name: "CIS BAYAD CENTER INC", code: "cisbayad", swift_code: "CIYCPHM2" },
    { name: "CITY SAVINGS BANK INC", code: "citysavings", swift_code: "CIPHPHMM" },
    { name: "CTBC BANK (PHILIPPINES) CORP.", code: "ctbc", swift_code: "CTCBPHMM" },
    { name: "DEVELOPMENT BANK OF THE PHILIPPINES", code: "dbp", swift_code: "DBPHPHMM" },
    { name: "DUMAGUETE CITY DEVELOPMENT BANK", code: "dumaguetebankx", swift_code: "DCDRPHM1" },
    { name: "DUNGGANON BANK", code: "dungganon", swift_code: "DUMRPHM1" },
    { name: "EastWest Bank", code: "eastwest", swift_code: "EWBCPHMM" },
    { name: "Easy Pay Global EMI Corp", code: "easypay", swift_code: null },
    { name: "EQUICOM SAVINGS BANK", code: "equicom", swift_code: "EQSNPHM1" },
    { name: "GCASH", code: "gcash", swift_code: null },
    { name: "GOTYME BANK", code: "gotyme", swift_code: "GOTYPHM2" },
    { name: "GRABPAY", code: "grabpay", swift_code: null },
    { name: "HSBC PHILIPPINES", code: "hsbc", swift_code: "HSBCPHMM" },
    { name: "IREMIT INCORPORATED", code: "iremit", swift_code: null },
    { name: "NATIONLINK", code: "infoserve", swift_code: null },
    { name: "ISLABANK", code: "isla", swift_code: "ISTHPHM1" },
    { name: "JuanCash", code: "zybi", swift_code: null },
    { name: "Komo/ EastWest Rural Bank", code: "eastwest_rural", swift_code: "EAWRPHM2" },
    { name: "LANDBANK / OFBank", code: "landbank", swift_code: "TLBPPHMM" },
    { name: "Lazada Wallet (Alipay Ph.)", code: "lazada", swift_code: "APHIPHM2" },
    { name: "Legazpi Savings Bank", code: "legazpi", swift_code: "LESIPHM1" },
    { name: "LUZON DEVELOPMENT BANK", code: "ldb", swift_code: "LUDVPHM1" },
    { name: "MALAYAN BANK", code: "malayan", swift_code: "MABKPHMM" },
    { name: "MarCoPay", code: "marcopay", swift_code: null },
    { name: "MariBank", code: "seabank", swift_code: "LAUIPHM2" },
    { name: "Maya Bank", code: "mayabank", swift_code: "MYYAPHM2" },
    { name: "May bank", code: "maybank", swift_code: "MBBEPHMM" },
    { name: "METRO BANK", code: "metrobank", swift_code: "MBTCPHMM" },
    { name: "MINDANAO CONSOLIDATED COOPERATIVE BANK", code: "mcb", swift_code: "MDCBPHM1" },
    { name: "myTOYOTA Wallet", code: "toyota", swift_code: null },
    { name: "NetBank", code: "netbank", swift_code: "CUOBPHM2" },
    { name: "OMINIPAY", code: "omnipay", swift_code: null },
    { name: "Own Bank", code: "ownb", swift_code: null },
    { name: "PalawanPay", code: "palawanpay", swift_code: null },
    { name: "PARTNER RURAL BANK COTABATO", code: "partnerrb", swift_code: null },
    { name: "PAYMAYA", code: "paymaya", swift_code: "MYYAPHM2" },
    { name: "PayMongo", code: "PayMongo", swift_code: null },
    { name: "Paynamics Technologies, Inc.", code: "paymamics", swift_code: null },
    { name: "PBCOM", code: "pbcom", swift_code: "CPHIPHMM" },
    { name: "PDAX", code: "pdax", swift_code: null },
    { name: "Peppermint Bizmoto Inc.", code: "peppermint", swift_code: null },
    { name: "PHILIPPINE VETERANS BANK", code: "veterans", swift_code: "PHVBPHMM" },
    { name: "PhilTrust Bank", code: "philtrust", swift_code: "PHTBPHMM" },
    { name: "PNB SAVINGS", code: "pnb", swift_code: "PNSAPHM1" },
    { name: "PRODUCERS BANK", code: "producers", swift_code: "PRBPPH21" },
    { name: "PSBank", code: "psbank", swift_code: "PHSBPHMM" },
    { name: "Queenbank", code: "queenbank", swift_code: "QCBKPHM1" },
    { name: "QUEZON CAPITAL RURAL BANK", code: "quezonbank", swift_code: "QCRIPHM1" },
    { name: "RCBC / Diskartech", code: "rcbc", swift_code: "RCBCPHMM" },
    { name: "ROBINSONS SAVINGS BANK", code: "robinsons", swift_code: "ROBPPHMQ" },
    { name: "RURAL BK APALIT", code: "rba", swift_code: "RUBKPHM1" },
    { name: "SECURITY BANK CORPORATION", code: "security", swift_code: "SETCPHMM" },
    { name: "SHOPEEPAY PHILIPPINES INC", code: "shopeepay", swift_code: "SHPHPHM2" },
    { name: "SpeedyPay", code: "speedypay", swift_code: null },
    { name: "STANDARD CHARTERED BANK PHILIPPINES", code: "standard_chartered", swift_code: "SCBLPHMM" },
    { name: "STARPAY CORPORATION", code: "starpay", swift_code: null },
    { name: "STERLING BANK OF ASIA", code: "sterling", swift_code: "STLAPH22" },
    { name: "SUN SAVINGS BANK", code: "sunsavings", swift_code: "SUSVPHM1" },
    { name: "TAYOCASH INC", code: "tayocash", swift_code: null },
    { name: "TONIK BANK", code: "tonik", swift_code: "TODGPHM2" },
    { name: "TraxionPay/ DigiCOOP/ COOPNET", code: "traxionpay", swift_code: null },
    { name: "UCPB SAVINGS BANK", code: "ucpb", swift_code: "UCPBPHMM" },
    { name: "UNION BANK OF THE PHILIPPINES", code: "unionbank", swift_code: "UBPHPHMM" },
    { name: "UnionDigital Bank", code: "uniondigital", swift_code: "UNODPHM2" },
    { name: "UNOBank", code: "UNO", swift_code: "UNODPHM2" },
    { name: "USSC MONEY SERVICE INC", code: "ussc", swift_code: "USMEPHM2" },
    { name: "Wealth Bank", code: "wealth", swift_code: "WEDRPHM1" },
    { name: "Wise Pilipinas, Inc.", code: "wiseph", swift_code: null },
    { name: "BANCO DE ORO", code: "bdo", swift_code: "BNORPHMM" },
    { name: "PHILIPPINE NATIONAL BANK PNB", code: "pnb", swift_code: "PNBMPHMM" },
    { name: "MUBUHAY BANK OF PHILIPPINES", code: "bangkomabuhay", swift_code: "MRTCPHM1" },
    { name: "BANK OF THE PHILIPPINE ISLANDS", code: "bpi", swift_code: "BOPIPHMM" },
    { name: "MAYA BANK, INC.", code: "mayabank", swift_code: "MYYAPHM2" },
    { name: "PHILIPPINE SAVINGS BANK", code: "psbank", swift_code: "PHSBPHMM" },
    { name: "RIZAL COMMERCIAL BANKING CORPORATION PHILIPPINE", code: "rcbc", swift_code: "RCBCPHMM" },
    { name: "LAND BANK OF THE PHILIPPINES", code: "landbank", swift_code: "TLBPPHMM" },
    { name: "PHILIPPINE NATIONAL BANK", code: "pnb", swift_code: "PNBMPHMM" },
    { name: "EAST WEST BANKING CORPORATION", code: "eastwest", swift_code: "EWBCPHMM" },
    { name: "CHINA BANK", code: "chinabank", swift_code: "CHBKPHMM" },
];

/** "eastwest_rural" -> "eastwestrural" (alphanumerics only). */
const cleanBankId = (providerCode) =>
    String(providerCode).replace(/[^A-Za-z0-9]/g, "");

module.exports = {
    async up(queryInterface) {
        for (const entry of PHP_BANKS_SEEDER_DATA) {
            const [existingRows] = await queryInterface.sequelize.query(
                "SELECT id FROM service_banks " +
                    "WHERE LOWER(bank_name) = :bankName AND external_type = 'ecp' " +
                    "LIMIT 1",
                { replacements: { bankName: entry.name.toLowerCase() } },
            );

            if (existingRows.length > 0) {
                await queryInterface.sequelize.query(
                    "UPDATE service_banks SET iso_code = :swiftCode, updated_at = NOW() " +
                        "WHERE id = :id",
                    {
                        replacements: {
                            swiftCode: entry.swift_code,
                            id: existingRows[0].id,
                        },
                    },
                );
                continue;
            }

            const bankId = cleanBankId(entry.code);
            const [bankIdRows] = await queryInterface.sequelize.query(
                "SELECT id FROM service_banks WHERE bank_id = :bankId LIMIT 1",
                { replacements: { bankId } },
            );
            if (bankIdRows.length > 0) {
                // Alias entry — the code's row already exists.
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
                        bankName: entry.name,
                        swiftCode: entry.swift_code,
                    },
                },
            );
        }
    },

    async down(queryInterface) {
        for (const entry of PHP_BANKS_SEEDER_DATA) {
            await queryInterface.sequelize.query(
                "DELETE FROM service_banks " +
                    "WHERE LOWER(bank_name) = :bankName " +
                    "AND external_type = 'ecp' AND country = 'PHL'",
                { replacements: { bankName: entry.name.toLowerCase() } },
            );
        }
    },
};
