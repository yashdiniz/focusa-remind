import { z } from "zod";
import { tool } from "ai";
import { type User } from "@/server/db/schema";
import { humanTime, validateRRule } from "../utils";
import { RRule } from "rrule";
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
dayjs.extend(utc)
dayjs.extend(timezone)

const create = (user: User) => {
    return tool({
        name: "reminder.create",
        description: "Create reminder. One-time reminders have due date. Recurring reminders have rrule. Set either one, not both. Check output of `repeats` and retry accordingly",
        inputSchema: z.object({
            title: z.string().describe("Reminder title"),
            type: z.enum(['one-time', 'recurring']).describe("one-time or recurring reminder"),
            rrule: z.string().describe("Recurrence rule, always include DTSTART;TZID, user local timezone. Optional").optional()
                .superRefine(validateRRule),
            dueDate: z.string().describe("Due date in ISO8601, user local timezone. Must be future date. Optional").optional()
                .superRefine((z, ctx) => {
                    if (z)
                        try {
                            const d = dayjs(z).tz('UTC')
                            if (d.toDate().getTime() - Date.now() < 0) ctx.addIssue("must be future date")
                        } catch (e) {
                            if (e instanceof Error) ctx.addIssue(`Invalid timestamp ${e.message}`)
                        }
                }),
            description: z.string().describe("Reminder description. Optional").optional(),
        }).superRefine((o, ctx) => {
            if (o.type === 'one-time' && o.rrule) ctx.addIssue({
                code: 'custom',
                message: 'dueDate required for one-time reminders',
                path: ['dueDate', 'rrule'],
            })
            else if (o.type === 'recurring' && o.dueDate) ctx.addIssue({
                code: 'custom',
                message: 'rrule required for recurring reminders',
                path: ['dueDate', 'rrule'],
            })
            else if (!(o.dueDate || o.rrule)) ctx.addIssue("must set either dueDate or rrule")
        }),
        outputSchema: z.object({
            id: z.uuidv7().describe("System reminder ID"),
            setAt: z.date().describe("reminder set date"),
            repeats: z.string().describe("recurrence pattern. Use this to check if system behavior matches user request"),
        }),
        execute(input) {
            const res = {
                id: "reminder123",
            }
            console.log(`${user.platform}-${user.identifier}`, "reminder.create tool called with input:", input);
            if (input.rrule) {
                const r = RRule.fromString(input.rrule)
                const setAt = dayjs.tz(r.options.dtstart.toISOString(), r.origOptions.tzid ?? 'UTC').tz('UTC').toDate()
                console.log('rrule set', setAt, r.origOptions.tzid)
                r.options.dtstart = setAt
                return {
                    ...res,
                    setAt,
                    repeats: r.toText(),
                }
            }
            if (input.dueDate) {
                const setAt = dayjs(input.dueDate).tz('UTC').toDate()
                return {
                    ...res,
                    setAt,
                    repeats: humanTime(setAt),
                }
            }
        },
    })
};

export function reminderTools(user: User) {
    return {
        "reminder.create": create(user),
    }
}