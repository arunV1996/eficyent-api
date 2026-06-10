import { PrismaClient } from "@prisma/client";
import { seed as seedDummy } from "./seeders/DummySeeder";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Starting Database Seeding ===");

  // Registered seeders - add new seeders here in the desired execution order
  await seedDummy(prisma);

  console.log("=== Database Seeding Finished ===");
}

main()
  .catch((e) => {
    console.error("Database seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
