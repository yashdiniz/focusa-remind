import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { users, type User } from "@/server/db/schema";
import { z } from "zod";
import { tool } from "ai";
import { validateTimezone } from "../utils";
import { generateSummaryPrompt } from "../agent";

const keepNote = (user: User) => tool({
    name: "keepNote",
    description: "Trigger when asked (“remember/store/forget/delete”) or on long-term info; include occupation, hobbies, recurring goals, priorities, deadlines, stable facts (“prefers concise answers,” “codes daily,” “data engineer”), accountability context and useful long-term info; exclude trivia, fleeting states (“ate pizza,” “tired”), sensitive data, one-offs. Keep existing points unless contradicted/flagged; confirm when uncertain",
    inputSchema: z.object({
        summary: z.string().describe("one-line changes to bio"),
    }),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "bio tool called with input:", input);
        if (user.metadata) {
            const reminders = await db.query.reminders.findMany({
                where: (reminders, { eq, and }) => and(
                    eq(reminders.userId, user.id),
                    // NOTE: PROBLEM! Would never get flagged for removal (since it would be filtered out)
                    // not(reminders.sent), not(reminders.deleted),
                ),
                orderBy: (reminders, { desc }) => [desc(reminders.dueAt), desc(reminders.createdAt)],
                limit: 20,
            }).execute()
            const summary = await generateSummaryPrompt(user, input.summary, reminders)
            await db.update(users).set({
                metadata: {
                    ...user.metadata,
                    summary,
                }
            }).where(eq(users.id, user.id)).execute();
            console.log(`${user.platform}-${user.identifier}`, "bio call occured", summary);
        } else return {
            error: "Cannot update bio without onboarding"
        }
    },
});

const upsert = (user: User) => tool({
    name: "userInfo",
    description: "Update user information",
    inputSchema: z.object({
        name: z.string().describe("user preferred name"),
        language: z.string().describe("user preferred language"),
        timezone: z.string().describe("user timezone, expect Intl.DateTimeFormat like 'America/New_York'")
            .refine(validateTimezone, {
                error: "Expect valid Intl.DateTimeFormat like 'America/New_York' or 'Asia/Kolkata'"
            }),
    }),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "userInfo tool called with input:", input);
        if (input.name.toLowerCase().includes('focusa')) {
            return {
                error: "Your name is FOCUSA Remind, user's name cannot be FOCUSA. Proceed with onboarding",
            }
        }

        await db.update(users).set({
            metadata: {
                ...user.metadata,
                ...input, // overwrite inputs
                summary: user.metadata?.summary ?? 'Empty summary', // preserve existing summary if any
            }
        }).where(eq(users.id, user.id)).execute();
        console.log(`${user.platform}-${user.identifier}`, "userInfo updated");
        return { success: true };
    }
});

export function userTools(user: User) {
    return {
        "userInfo": upsert(user),
        // add these only after onboarding
        ...(user.metadata ? {
            "keepNote": keepNote(user),
        } : undefined),
    }
}