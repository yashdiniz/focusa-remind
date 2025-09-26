import { z } from "zod";
import { tool } from "ai";
import { users, type User } from "@/server/db/schema";
import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { generateSummaryPrompt } from "../agent";

const upsert = (user: User) => tool({
    name: "bio",
    description: "Trigger when asked (“remember/store/forget/delete”) or on enduring info; include occupation, hobbies, recurring goals, priorities, deadlines, stable facts (“prefers concise answers,” “codes daily,” “data engineer”), accountability context; exclude trivia, fleeting states (“ate pizza,” “tired”), sensitive data, one-offs. Keep existing points unless contradicted/flagged; confirm when uncertain",
    inputSchema: z.object({
        summary: z.string().describe("New concise summary"),
    }),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "bio tool called with input:", input);
        if (user.metadata) {
            const summary = await generateSummaryPrompt(user, input.summary)
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

export function summaryTools(user: User) {
    return {
        "bio": upsert(user),
    }
}