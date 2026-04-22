import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.session.delete({
    where: { id: "offline_skywaytrading.myshopify.com" }
  });
  console.log("Deleted broken session:", result);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
