import { PrismaClient } from "@prisma/client";

export async function seed(prisma: PrismaClient): Promise<void> {
  console.log("Seeding Dummy table...");

  const count = await prisma.dummy.count();
  if (count > 0) {
    console.log("Dummy table already seeded.");
    return;
  }

  await prisma.dummy.createMany({
    data: [
      {
        name: "Alice Johnson",
        email: "alice@example.com",
        status: 1,
      },
      {
        name: "Bob Smith",
        email: "bob@example.com",
        status: 1,
      },
      {
        name: "Charlie Brown",
        email: "charlie@example.com",
        status: 0,
      },
    ],
  });

  console.log("Seeding Dummy table completed successfully.");
}
