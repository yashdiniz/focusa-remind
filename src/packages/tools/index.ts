import { z } from "zod";
import { tool, type ToolSet } from "ai";
import { users, type User } from "@/server/db/schema";
import { db } from "@/server/db";
import { eq } from "drizzle-orm";

const updateUserInfo = (user: User) => tool({
    name: "updateUserInfo",
    description: "Update user information.",
    inputSchema: z.object({
        name: z.string().describe("Name of the user"),
        language: z.string().describe("Preferred language of the user"),
        timezone: z.string().describe("Timezone of the user, expected in tz database format like 'America/New_York'")
            .refine(tz => {
                // Check if Intl API and timeZone option are supported in the environment
                if (!Intl?.DateTimeFormat().resolvedOptions().timeZone) {
                    console.warn('Intl.DateTimeFormat with timeZone option is not fully supported in this environment.');
                    // You might choose to throw an error or return false here depending on your needs
                    return false;
                }

                try {
                    // Attempt to create a DateTimeFormat object with the given timezone
                    // If the timezone is invalid, it will throw a RangeError
                    new Intl.DateTimeFormat(undefined, { timeZone: tz });
                    return true; // If no error, the timezone is considered valid
                } catch (e) {
                    if (e instanceof RangeError) {
                        console.error('Invalid timezone provided:', tz);
                    }
                    // Catch the RangeError if the timezone is invalid
                    return false;
                }
            }, {
                error: "Please use a valid tz database format like 'America/New_York' or 'Asia/Kolkata'."
            }),
    }),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "userInfo tool called with input:", input);
        await db.update(users).set({
            metadata: {
                ...input,
                summary: 'Empty summary.',
            }
        }).where(eq(users.id, user.id)).execute();
        console.log(`${user.platform}-${user.identifier}`, "userInfo updated:", user);
    }
});

const createReminder = (user: User) => tool({
    name: "createReminder",
    description: "Create a reminder for the user.",
    inputSchema: z.object({
        title: z.string().describe("Title of the reminder"),
        datetime: z.string().describe("Date and time for the reminder in ISO 8601 format"),
        rrule: z.string().optional().describe("Recurrence rule for the reminder in RFC5545 RRULE format. Be sure to include timezone with DTSTART;TZID."),
        timezone: z.string().describe("Timezone of the user, expected in tz database format like 'America/New_York'")
            .refine(tz => {
                // Check if Intl API and timeZone option are supported in the environment
                if (!Intl?.DateTimeFormat().resolvedOptions().timeZone) {
                    console.warn('Intl.DateTimeFormat with timeZone option is not fully supported in this environment.');
                    // You might choose to throw an error or return false here depending on your needs
                    return false;
                }

                try {
                    // Attempt to create a DateTimeFormat object with the given timezone
                    // If the timezone is invalid, it will throw a RangeError
                    new Intl.DateTimeFormat(undefined, { timeZone: tz });
                    return true; // If no error, the timezone is considered valid
                } catch (e) {
                    if (e instanceof RangeError) {
                        console.error('Invalid timezone provided:', tz);
                    }
                    // Catch the RangeError if the timezone is invalid
                    return false;
                }
            }, {
                error: "Please use a valid tz database format like 'America/New_York' or 'Asia/Kolkata'."
            })
    }),
    execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "createReminder tool called with input:", input);
        return "reminderId123"; // Return a mock reminder ID
    },
});

const createNote = (user: User) => tool({
    name: "createNote",
    description: "Create a note for the user. Use this to store important information about the user that can help you assist them better in future. For example, their goals, priorities, challenges, preferences, etc.",
    inputSchema: z.object({
        title: z.string().describe("Title of the note. This should be a short summary of the note content."),
        description: z.string().describe("Content of the note. This should be a detailed description of the note."),
    }),
    execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "createNote tool called with input:", input);
        return "noteId123"; // Return a mock note ID
    },
});

/**
 * Toolset for the AI agent. Wraps each tool with user context.
 * @param ctx Context containing userId for authentication and logging.
 * @returns ToolSet with user-specific tool implementations.
 */
export function tools(user: User): ToolSet {
    return {
        updateUserInfo: updateUserInfo(user),
        createReminder: createReminder(user),
        createNote: createNote(user),
    }
}

// import { evaluate } from "mathjs";
// export function getTools(toString?: boolean): Record<string, string> | string {
//     const toolSet: Record<string, string> = {};
//     for (const [key, value] of Object.entries(tools)) toolSet[key] = value.description ?? "No description available";
//     if (toString) {
//         return `Available tools:\n\n ${Object.entries(toolSet).map(([key, value]) => `- ${key}: ${value}`).join("\n")}`;
//     }
//     return toolSet;
// }

// const eval_math_expression = tool({
//     name: "eval_math_expression",
//     description: 'A tool for evaluating mathematical expressions. Example expressions: ' + "'1.2 * (2 + 4.5)', '12.7 cm to inch', 'sin(45 deg) ^ 2'.",
//     inputSchema: z.object({ expression: z.string() }),
//     execute: async ({ expression }) => {
//         try {
//             const result = evaluate(expression) as { toString(): string };
//             if (typeof result.toString === "function") {
//                 return {
//                     content: [{ type: "text", text: result.toString() }],
//                 };
//             }
//             throw new Error("invalid result from mathjs evaluate");
//         } catch (e: unknown) {
//             const message = e instanceof Error ? e.message : String(e);
//             return {
//                 content: [{ type: "text", text: `Error: ${message}` }],
//             };
//         }
//     }
// });