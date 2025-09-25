import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { users, type User } from "@/server/db/schema";
import { z } from "zod";
import { tool } from "ai";
import { validateTimezone } from "../utils";

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
                ...input,
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
    }
}