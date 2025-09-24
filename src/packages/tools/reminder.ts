import { z } from "zod";
import { tool } from "ai";
import { type User } from "@/server/db/schema";
import { validateTimezone } from "../utils";

const create = (user: User) => tool({
    name: "reminder.create",
    description: "Create a reminder for the user",
    inputSchema: z.object({
        title: z.string().describe("Title of the reminder"),
        datetime: z.string().describe("Date and time for the reminder in ISO 8601 format"),
        rrule: z.string().optional().describe("Recurrence rule for the reminder in RFC5545 RRULE format, be sure to include timezone with DTSTART;TZID"),
        timezone: z.string().describe("Timezone of the user, expected in Intl.DateTimeFormat like 'America/New_York'")
            .refine(validateTimezone, {
                error: "Please use a valid Intl.DateTimeFormat like 'America/New_York' or 'Asia/Kolkata'"
            })
    }),
    execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "reminder.create tool called with input:", input);
        return "reminderId123"; // Return a mock reminder ID
    },
});

export function reminderTools(user: User) {
    return {
        "reminder.create": create(user),
    }
}