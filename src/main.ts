import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { ensureDefaultAdmin } from "./bootstrap.js";
import { createDependencyReadinessCheck } from "./readiness.js";
import { validateStartupConfig } from "./security.js";

const prisma = new PrismaClient();
const port = Number(process.env.PORT || 4000);

async function start() {
  validateStartupConfig();
  const app = createApp(prisma, {
    readinessCheck: createDependencyReadinessCheck(prisma, process.env.REDIS_URL as string)
  });
  await ensureDefaultAdmin(prisma);
  app.listen(port, () => {
    console.log(`LifeOS API listening on :${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start LifeOS API", error);
  process.exit(1);
});
