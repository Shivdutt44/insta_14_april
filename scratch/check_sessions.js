import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.session.findMany();
  console.log("Sessions found:", sessions.length);
  sessions.forEach(s => {
    console.log(`Shop: ${s.shop}, ID: ${s.id}, HasToken: ${!!s.accessToken}, TokenLength: ${s.accessToken?.length}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
