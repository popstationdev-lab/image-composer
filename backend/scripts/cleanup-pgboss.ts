import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    try {
        const tables = [
            'version', 'queue', 'schedule', 'subscription', 'archive', 'job'
        ];
        for (const table of tables) {
            console.log(`Dropping public.${table}...`);
            await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS public."${table}" CASCADE`);
        }
        // Also drop the weird hash table if it exists
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS public."j3f168501ed9816b51a9f5765e0742e1eb034ab6bf72c9ae3f3a975e3" CASCADE`);

        console.log("Cleanup complete.");
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
