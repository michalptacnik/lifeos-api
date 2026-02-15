import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { ensureDefaultAdmin } from "./bootstrap.js";
import { validateStartupConfig } from "./security.js";

const prisma = new PrismaClient();
const app = createApp(prisma);
const port = Number(process.env.PORT || 4000);

async function start() {
  validateStartupConfig();
  await ensureDefaultAdmin(prisma);
  app.listen(port, () => {
    console.log(`LifeOS API listening on :${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start LifeOS API", error);
  process.exit(1);
});
