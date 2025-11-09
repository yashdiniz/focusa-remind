import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { users, type User } from "@/server/db/schema";
import { z } from "zod";
import { tool } from "ai";
import { /*updateBio,*/ validateTimezone } from "../utils";
import { encode } from "@toon-format/toon";
import { searchMemories } from "../memory";

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
//         } else return encode({
//             success: false,
//             error: "Cannot update bio without onboarding",
//         })
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
            return encode({
                success: false,
                error: "Your name is FOCUSA Remind, user's name cannot be FOCUSA. Proceed with onboarding",
            })
        }

        await db.update(users).set({
            metadata: {
                ...user.metadata,
                ...input, // overwrite inputs
            }
        }).where(eq(users.id, user.id)).execute();
        console.log(`${user.platform}-${user.identifier}`, "userInfo updated");
        return encode({ success: true });
    }
});

const search = (user: User) => tool({
    description: "Search (recall) memories/details/information about the user or other facts or entities. Run when explicitly asked or when context about user's past choices would be helpful",
    inputSchema: z.object({
        informationToGet: z.string().describe("Terms to search for in the user's memories"),
    }),
    async execute({ informationToGet: q }) {
        try {
            const res = await searchMemories(q, user)

            return encode({
                success: true,
                results: res,
            })
        } catch (error) {
            return encode({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            })
        }
    },
})

// const addMemory = (user: User, client: Supermemory) => tool({
//     description: "Add (remember) memories/details/information about the user or other facts or entities. Run when explicitly asked or when the user mentions any information generalizable beyond the context of the current conversation.",
//     inputSchema: z.object({
//         memory: z
//             .string()
//             .describe("The text content of the memory to add. This should be a single sentence or a short paragraph."),
//     }),
//     execute: async ({ memory }) => {
//         try {
//             const metadata: Record<string, string | number | boolean> = {}

//             const response = await client.memories.add({
//                 content: memory,
//                 containerTag: `user_${user.platform}-${user.identifier}`,
//                 ...(Object.keys(metadata).length > 0 && { metadata }),
//             })

//             return encode({
//                 success: true,
//                 memory: response,
//             })
//         } catch (error) {
//             return encode({
//                 success: false,
//                 error: error instanceof Error ? error.message : "Unknown error",
//             })
//         }
//     },
// })

export function userTools(user: User) {
    return {
        "userInfo": upsert(user),
        // add these only after onboarding
        ...(user.metadata ? {
            // "keepNote": keepNote(user),
            searchMemories: search(user),
            // addMemory: addMemory(user, client),
        } : undefined),
    }
}