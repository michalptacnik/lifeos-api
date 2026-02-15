import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function ensureDefaultAdmin(prisma: PrismaClient) {
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL ?? "admin@lifeos.local");
  const adminPassword = process.env.ADMIN_PASSWORD ?? (process.env.NODE_ENV === "development" ? "password" : undefined);
  if (!adminPassword) {
    throw new Error("ADMIN_PASSWORD is required outside development");
  }
  const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() || "Admin";

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      displayName,
      passwordHash
    },
    create: {
      email: adminEmail,
      displayName,
      passwordHash
    },
    select: { id: true, email: true }
  });

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    select: { id: true }
  });

  if (!membership) {
    await prisma.household.create({
      data: {
        name: `${adminEmail} household`,
        memberships: {
          create: {
            userId: user.id,
            role: Role.OWNER
          }
        }
      }
    });
  }

  console.log(`[auth] default admin ready: ${adminEmail}`);
}
