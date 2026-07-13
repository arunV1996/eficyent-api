import Currency from "../models/currency.model";
import * as constants from "../utils/constants";

interface SeedCurrency {
    code: string;
    name: string;
    type:
        | typeof constants.CURRENCY_TYPE_FIAT
        | typeof constants.CURRENCY_TYPE_CRYPTO;
    status:
        | typeof constants.CURRENCY_STATUS_ACTIVE
        | typeof constants.CURRENCY_STATUS_INACTIVE;
}

const currenciesToSeed: SeedCurrency[] = [
    {
        code: "USD",
        name: "US Dollar",
        type: constants.CURRENCY_TYPE_FIAT,
        status: constants.CURRENCY_STATUS_ACTIVE,
    },
    {
        code: "EUR",
        name: "Euro",
        type: constants.CURRENCY_TYPE_FIAT,
        status: constants.CURRENCY_STATUS_ACTIVE,
    },
    {
        code: "INR",
        name: "Indian Rupee",
        type: constants.CURRENCY_TYPE_FIAT,
        status: constants.CURRENCY_STATUS_ACTIVE,
    },
    {
        code: "BTC",
        name: "Bitcoin",
        type: constants.CURRENCY_TYPE_CRYPTO,
        status: constants.CURRENCY_STATUS_ACTIVE,
    },
    {
        code: "ETH",
        name: "Ethereum",
        type: constants.CURRENCY_TYPE_CRYPTO,
        status: constants.CURRENCY_STATUS_ACTIVE,
    },
    {
        code: "USDT",
        name: "Tether",
        type: constants.CURRENCY_TYPE_CRYPTO,
        status: constants.CURRENCY_STATUS_ACTIVE,
    },
    {
        code: "USDC",
        name: "USD Coin",
        type: constants.CURRENCY_TYPE_CRYPTO,
        status: constants.CURRENCY_STATUS_ACTIVE,
    },
];

export async function seedCurrencies() {
    console.log("Starting currency seeding...");
    let seededCount = 0;
    let skippedCount = 0;

    for (const currencyData of currenciesToSeed) {
        // Check if the currency with this code already exists in the database
        const existingCurrency = await Currency.findOne({
            where: { code: currencyData.code },
        });

        if (!existingCurrency) {
            await Currency.create(currencyData);
            console.log(`Successfully seeded currency: ${currencyData.code}`);
            seededCount++;
        } else {
            console.log(
                `Currency ${currencyData.code} already exists. Skipping.`,
            );
            skippedCount++;
        }
    }

    console.log(
        `Currency Seeding Complete. Seeded: ${seededCount}, Skipped: ${skippedCount}`,
    );
}
