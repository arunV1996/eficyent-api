import sequelize from "../config/database";
import { seedCurrencies } from "./currency.seeder";

async function runAllSeeders() {
    try {
        // Authenticate database connection
        await sequelize.authenticate();
        console.log("Database connection established for seeding.");

        // Execute the currency seeder
        await seedCurrencies();

        console.log("All seeders executed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error executing seeders:", error);
        process.exit(1);
    }
}

// Execute seeders
runAllSeeders();
