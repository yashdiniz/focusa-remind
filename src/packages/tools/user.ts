import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { users, type User } from "@/server/db/schema";
import { z } from "zod";
import { tool } from "ai";
import { validateTimezone } from "../utils";

const update = (user: User) => tool({
    name: "user.info",
    description: "Update user information",
    inputSchema: z.object({
        name: z.string().describe("Name of the user"),
        language: z.string().describe("Preferred language of the user"),
        timezone: z.string().describe("Timezone of the user, expected in Intl.DateTimeFormat like 'America/New_York'")
            .refine(validateTimezone, {
                error: "Please use a valid Intl.DateTimeFormat like 'America/New_York' or 'Asia/Kolkata'"
            }),
    }),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "user.info tool called with input:", input);
        if (input.name.toLowerCase().includes('focusa')) {
            return {
                error: "Your name is FOCUSA Remind, the user's name is not FOCUSA. Proceed with onboarding and do not engage in other topics",
            }
        }

        await db.update(users).set({
            metadata: {
                ...input,
                summary: user.metadata?.summary ?? 'Empty summary', // preserve existing summary if any
            }
        }).where(eq(users.id, user.id)).execute();
        console.log(`${user.platform}-${user.identifier}`, "user.info updated");
        return { success: true };
    }
});

export function userTools(user: User) {
    return {
        "user.info": update(user),
    }
}