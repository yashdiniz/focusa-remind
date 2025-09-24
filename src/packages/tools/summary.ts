import { z } from "zod";
import { tool } from "ai";
import { users, type User } from "@/server/db/schema";
import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { generateSummaryPrompt } from "../agent";

const create = (user: User) => tool({
    name: "summary.update",
    description: "Call when user instructs (“remember,” “store,” “forget,” “delete”) or when you find long-term relevant info; produce concise bullet-point bio including occupation, hobbies, recurring goals, priorities, deadlines, stable long-term facts (e.g., “prefers concise answers,” “codes daily,” “data engineer”), accountability context; exclude trivia, fleeting context (e.g., “ate pizza,” “tired today”), sensitive categories, one-off tasks/reminders; keep existing points unless contradicted or explicitly flagged for removal; confirm with user if relevance uncertain",
    inputSchema: z.object({
        summary: z.string().describe("New updated summary in concise bullet-points"),
    }),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "summary.update tool called with input:", input);
        if (user.metadata) {
            const summary = await generateSummaryPrompt(user, input.summary)
            await db.update(users).set({
                metadata: {
                    ...user.metadata,
                    summary,
                }
            }).where(eq(users.id, user.id)).execute();
            console.log(`${user.platform}-${user.identifier}`, "summary.update occured", summary);
        } else return {
            error: "onboarding is not done yet. Cannot update summary without onboarding. Please proceed with onboarding"
        }
    },
});

export function summaryTools(user: User) {
    return {
        "summary.create": create(user),
    }
}