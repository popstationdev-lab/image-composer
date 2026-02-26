import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    try {
        const schemas = await prisma.$queryRaw`SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname IN ('public', 'pgboss')`;
        console.log("Schemas:", schemas);

        const tables = await prisma.$queryRaw`SELECT tablename, schemaname FROM pg_catalog.pg_tables WHERE schemaname IN ('public', 'pgboss')`;
        console.log("Tables:", tables);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
