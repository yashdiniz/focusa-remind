import { z } from "zod";
import { tool } from "ai";
import { type User } from "@/server/db/schema";
import { validateRRule } from "../utils";

const create = (user: User) => tool({
    name: "reminder.create",
    description: "Create reminder for user",
    inputSchema: z.object({
        title: z.string().describe("Reminder title"),
        dueAt: z.string().describe("Reminder due date in ISO8601 format").optional(),
        rrule: z.string().describe("Reminder recurrence rule in RFC5545 RRULE format, always include DTSTART;TZID, user timezone").optional()
            .refine(validateRRule, {
                error: "Expect valid RFC5545 RRULE, along with DTSTART;TZID"
            }),
        priority: z.enum(['A', 'B', 'C']).describe("Reminder priority, A:high B:medium C:low").optional(),
        description: z.string().describe("Reminder description").optional(),
    }),
    outputSchema: z.object({
        id: z.uuidv7().describe("System reminder ID"),
    }),
    execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "reminder.create tool called with input:", input);
        return { id: "reminder123" }; // Return a mock reminder ID
    },
});

export function reminderTools(user: User) {
    return {
        "reminder.create": create(user),
    }
}