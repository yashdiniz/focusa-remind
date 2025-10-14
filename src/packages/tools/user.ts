import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { users, type User } from "@/server/db/schema";
import { z } from "zod";
import { tool } from "ai";
import { /*updateBio,*/ validateTimezone } from "../utils";
import { supermemoryTools } from "@supermemory/tools/ai-sdk";
import { env } from "@/env";

// const keepNote = (user: User) => tool({
//     name: "keepNote",
//     description: "Trigger when asked (“remember/store/forget/delete”) or when user shares long-term useful info; confirm when uncertain",
//     inputSchema: z.object({
//         summary: z.string().describe("one-line changes to bio"),
//     }),
//     async execute(input) {
//         console.log(`${user.platform}-${user.identifier}`, "bio tool called with input:", input);
//         if (user.metadata) {
//             const summary = await updateBio(user, input.summary)
//             console.log(`${user.platform}-${user.identifier}`, "bio call occured", summary);
//         } else return {
//             error: "Cannot update bio without onboarding"
//         }
//     },
// });

const upsert = (user: User) => tool({
    name: "userInfo",
    description: "Update user preferences/information",
    inputSchema: z.object({
        name: z.string().describe("preferred name"),
        language: z.string().describe("preferred language"),
        timezone: z.string().describe("timezone, expect Intl.DateTimeFormat like 'America/New_York'")
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
            // "keepNote": keepNote(user),
            ...supermemoryTools(env.SUPERMEMORY_API_KEY, {
                containerTags: [`${user.platform}-${user.identifier}`],
            }),
        } : undefined),
    }
}