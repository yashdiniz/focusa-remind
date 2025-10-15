import { z } from "zod";
import { tool } from "ai";
import { reminders, type ReminderInsert, type User } from "@/server/db/schema";
import { humanTime, reminderListToString, /*updateBio,*/ validateRRule } from "../utils";
import { RRule } from "rrule";
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { db } from "@/server/db";
import type Supermemory from "supermemory";
dayjs.extend(utc)
dayjs.extend(timezone)

const create = (user: User, client: Supermemory) => tool({
    name: "reminder.create",
    description: "Create reminder. One-time reminders have due date. Recurring reminders have rrule. Set either one, not both. Share output of `repeats` with user to confirm",
    inputSchema: z.object({
        title: z.string().describe("Reminder title"),
        type: z.enum(['one-time', 'recurring']).describe("one-time or recurring reminder"),
        priority: z.enum(['low', 'medium', 'high']).describe("assume reminder priority").default('low'),
        rrule: z.string().describe("Recurrence rule, always include DTSTART;TZID, user local timezone. Optional").optional()
            .superRefine(validateRRule),
        dueDate: z.string().describe("Due date in ISO8601, user local timezone. Must be future date. Optional").optional()
            .superRefine((z, ctx) => {
                if (z)
                    try {
                        const d = dayjs(z).tz('UTC')
                        const seconds = (d.toDate().getTime() - Date.now()) / 1000
                        if (seconds < 0) ctx.addIssue(`must be future date. due date shared is ${seconds} seconds ago`)
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
    async execute(input) {
        const rem: ReminderInsert & { repeats?: string } = {
            userId: user.id,
            title: input.title,
            description: input.description ?? null,
            priority: input.priority,
        }
        console.log(`${user.platform}-${user.identifier}`, "reminder.create tool called with input:", input);
        if (input.rrule) {
            const r = RRule.fromString(input.rrule)
            const setAt = dayjs.tz(r.options.dtstart.toISOString(), r.origOptions.tzid ?? 'UTC').tz(r.origOptions.tzid ?? 'UTC').toDate()
            console.log('rrule set', setAt, r.origOptions.tzid)
            r.options.dtstart = setAt
            rem.dueAt = setAt
            rem.rrule = r.toString()
            rem.repeats = r.toText()
        }
        if (input.dueDate) {
            const setAt = dayjs(input.dueDate, user.metadata?.timezone ?? 'UTC').tz(user.metadata?.timezone ?? 'UTC').toDate()
            rem.dueAt = setAt
            rem.repeats = humanTime(setAt)
        }
        const reminder = await db.insert(reminders).values(rem).returning().execute()
        if (reminder && reminder.length === 1 && reminder[0]?.id) {
            await client.memories.add({
                content: `User added a new reminder: ${reminderListToString(reminder)}`,
                containerTags: [`user_${user.platform}-${user.identifier}`],
            })
            // await updateBio(user, '')
            console.log(`${user.platform}-${user.identifier}`, "reminder.create occured", reminder[0]);
            return { id: reminder[0].id, repeats: rem.repeats, setAt: rem.dueAt }
        }
        throw new Error('Could not create reminder!')
    },
});

export function reminderTools(user: User, client: Supermemory) {
    return {
        ...(user.metadata ? {
            "reminder.create": create(user, client),
        } : undefined),
    }
}