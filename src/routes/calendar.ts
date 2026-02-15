import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { escapeIcsText, toIcsDate } from "../calendar.js";
import { ensureContext } from "../domain.js";

export function createCalendarRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/tasks.ics", async (req, res) => {
    try {
      const { householdId } = await ensureContext(prisma, req);
      const tasks = await prisma.task.findMany({
        where: { householdId },
        include: { owner: { select: { email: true } } },
        orderBy: { createdAt: "desc" },
        take: 300
      });

      const now = new Date();
      const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//LifeOS//Tasks//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH"
      ];

      for (const task of tasks) {
        const start = task.startedOn ?? task.createdAt;
        const end = task.finishedOn ?? new Date(start.getTime() + 60 * 60 * 1000);
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${task.id}@lifeos`);
        lines.push(`DTSTAMP:${toIcsDate(now)}`);
        lines.push(`DTSTART:${toIcsDate(start)}`);
        lines.push(`DTEND:${toIcsDate(end)}`);
        lines.push(`SUMMARY:${escapeIcsText(task.title)}`);
        const desc = escapeIcsText(
          [
            `Status: ${task.status}`,
            `Area: ${task.area}`,
            task.project ? `Project: ${task.project}` : "",
            task.owner?.email ? `Owner: ${task.owner.email}` : "",
            task.description ? `Notes: ${task.description}` : ""
          ]
            .filter(Boolean)
            .join(" | ")
        );
        lines.push(`DESCRIPTION:${desc}`);
        lines.push("END:VEVENT");
      }

      lines.push("END:VCALENDAR");

      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.send(lines.join("\r\n"));
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  });

  return router;
}
