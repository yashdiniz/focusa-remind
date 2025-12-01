import { z } from "zod";
import { tool } from "ai";
import { reminders, type ReminderInsert, type User } from "@/server/db/schema";
import { humanTime, /*reminderListToString, updateBio,*/ validateRRule } from "../utils";
import { RRule } from "rrule";
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { db } from "@/server/db";
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { encode } from '@toon-format/toon';
dayjs.extend(utc)
dayjs.extend(timezone)

const RetrievalSchema = (user: User) => z.object({
    ids: z.array(z.uuidv7()).describe("list of reminder IDs. Optional"),
    from: z.string().describe("start datetime for the due date search in YYYY-MM-DD HH:MM. Optional")
        .superRefine((z, ctx) => {
            if (z)
                try {
                    if (dayjs.tz(z, user.metadata?.timezone ?? 'UTC').tz('UTC').isAfter(dayjs()))
                        ctx.addIssue('must be past date')
                } catch (e) {
                    if (e instanceof Error) ctx.addIssue(`Invalid timestamp ${e.message}`)
                }
        }),
    to: z.string().describe("end datetime for the due date search in YYYY-MM-DD HH:MM. Optional")
        .superRefine((z, ctx) => {
            if (z)
                try {
                    if (dayjs.tz(z, user.metadata?.timezone ?? 'UTC').tz('UTC').isAfter(dayjs()))
                        ctx.addIssue('must be past date')
                } catch (e) {
                    if (e instanceof Error) ctx.addIssue(`Invalid timestamp ${e.message}`)
                }
        }),
    informationToGet: z.string().describe("Terms to search for in the user's memories in web search query format. Optional"),
    includeCompleted: z.boolean().describe("whether to include completed reminders").default(false),
    recurring: z.boolean().describe("whether to filter only recurring reminders").default(false),
}).partial().superRefine((o, ctx) => {
    if (o.from && o.to && dayjs(o.from).isAfter(dayjs(o.to))) ctx.addIssue("from must be before to in search")
})

function searchQuery(user: User, input: unknown) {
    const { ids, from, to, includeCompleted, recurring, informationToGet } = RetrievalSchema(user).parse(input)
    if (ids) return inArray(reminders.id, ids) // ignore other inputs if ids provided
    return and(
        from ? gte(reminders.dueAt, dayjs.tz(from, user.metadata?.timezone ?? 'UTC').tz('UTC').toDate()) : undefined,
        to ? lte(reminders.dueAt, dayjs.tz(to, user.metadata?.timezone ?? 'UTC').tz('UTC').toDate()) : undefined,
        eq(reminders.sent, includeCompleted ?? false),
        recurring ? isNotNull(reminders.rrule) : undefined,
        informationToGet ? sql`to_tsvector('english', coalesce(concat(${reminders.title}, ' ', ${reminders.description}), ${reminders.title})) @@ websearch_to_tsquery('english', ${informationToGet})` : undefined,
    )
}

const createTask = (user: User) => tool({
    description: "Create task. Tasks do not notify the user, and have a deadline by which the user must complete the task",
    inputSchema: z.object({
        title: z.string().describe("Task title"),
        priority: z.enum(['low', 'medium', 'high']).describe("assume task priority").default('low'),
        deadline: z.string().describe("Deadline in YYYY-MM-DD HH:MM")
            .superRefine((z, ctx) => {
                if (z)
                    try {
                        if (dayjs.tz(z, user.metadata?.timezone ?? 'UTC').tz('UTC').isBefore(dayjs()))
                            ctx.addIssue('must be future date, ask user to set a few hours ahead')
                    } catch (e) {
                        if (e instanceof Error) ctx.addIssue(`Invalid timestamp ${e.message}`)
                    }
            }),
        description: z.string().describe("Task description. Optional").optional(),
    }),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "reminder.createTask tool called with input:", input);
        const setAt = dayjs.tz(input.deadline, user.metadata?.timezone ?? 'UTC').tz(user.metadata?.timezone ?? 'UTC').toDate()
        const task: ReminderInsert & { repeats?: string } = {
            userId: user.id,
            title: input.title,
            description: input.description ?? null,
            priority: input.priority,
            dueAt: setAt,
            repeats: humanTime(setAt),
            isTask: true,
        }
        const reminder = await db.insert(reminders).values(task).returning().execute()
        if (reminder && reminder.length === 1 && reminder[0]?.id) {
            console.log(`${user.platform}-${user.identifier}`, "reminder.createTask occured", reminder[0]);
            return encode({ id: reminder[0].id, repeats: task.repeats, setAt: task.dueAt })
        }
        return encode({
            success: false,
            error: 'could not create reminder'
        })
    },
});

const create = (user: User) => tool({
    description: "Create reminder. One-time reminders have due date. Recurring reminders have rrule. Set either one, not both. If no time provided, assume user means a few hours ahead. Share output of `repeats` with user to confirm",
    inputSchema: z.object({
        title: z.string().describe("Reminder title"),
        type: z.enum(['one-time', 'recurring']).describe("one-time or recurring reminder"),
        priority: z.enum(['low', 'medium', 'high']).describe("assume reminder priority").default('low'),
        rrule: z.string().describe("Recurrence rule, always include DTSTART;TZID with user local timezone. Do not set if one-time reminder. Optional").optional()
            .superRefine(validateRRule),
        dueDate: z.string().describe("Due date in YYYY-MM-DD HH:MM. Do not set if recurring reminder. Optional").optional()
            .superRefine((z, ctx) => {
                if (z)
                    try {
                        if (dayjs.tz(z, user.metadata?.timezone ?? 'UTC').tz('UTC').isBefore(dayjs()))
                            ctx.addIssue('must be future date, ask user to set a few hours ahead')
                    } catch (e) {
                        if (e instanceof Error) ctx.addIssue(`Invalid timestamp ${e.message}`)
                    }
            }),
        description: z.string().describe("Reminder description. Optional").optional(),
    }).superRefine((o, ctx) => {
        if (o.type === 'one-time' && o.rrule) ctx.addIssue({
            code: 'custom',
            message: 'dueDate required for one-time reminders, do not set rrule',
            path: ['dueDate', 'rrule'],
        })
        else if (o.type === 'recurring' && o.dueDate) ctx.addIssue({
            code: 'custom',
            message: 'rrule required for recurring reminders, do not set dueDate',
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
            const setAt = dayjs.tz(input.dueDate, user.metadata?.timezone ?? 'UTC').tz(user.metadata?.timezone ?? 'UTC').toDate()
            rem.dueAt = setAt
            rem.repeats = humanTime(setAt)
        }
        const reminder = await db.insert(reminders).values(rem).returning().execute()
        if (reminder && reminder.length === 1 && reminder[0]?.id) {
            console.log(`${user.platform}-${user.identifier}`, "reminder.create occured", reminder[0]);
            return encode({ id: reminder[0].id, repeats: rem.repeats, setAt: rem.dueAt })
        }
        return encode({
            success: false,
            error: 'could not create reminder'
        })
    },
});

const search = (user: User) => tool({
    description: "Search (list/display) matching reminders and tasks. Run only when details are not already in ReminderList. Set input as null to get all reminders and tasks",
    inputSchema: RetrievalSchema(user).describe("only set necessary fields, else undefined. Optional").nullable(),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "reminder.search tool called with input:", input);
        const reminders = await db.query.reminders.findMany({
            where: (reminders, { and, eq }) => and(
                eq(reminders.userId, user.id),
                input ? searchQuery(user, input) : undefined,
            )
        }).execute()
        console.log(`${user.platform}-${user.identifier}`, `reminder.search found ${reminders.length} reminders`);
        return encode(reminders.map(r => ({
            id: r.id,
            title: r.title, sent: r.sent, deleted: r.deleted, priority: r.priority,
            ...(r.description ? { description: r.description } : undefined),
            ...(r.dueAt ? { dueDate: dayjs(r.dueAt).tz(user.metadata?.timezone ?? 'UTC').format('YYYY-MM-DD HH:mm') } : undefined),
            ...(r.rrule ? { rrule: r.rrule } : undefined),
        })));
    },
});

// const update = (user: User) => tool({
//     description: "Update/modify existing reminder. Only set fields that need to be updated",
//     inputSchema: z.object({
//         id: z.uuidv7().describe("Reminder ID"),
//         type: z.enum(['one-time', 'recurring']).describe("one-time or recurring reminder. Optional").optional().nullable(),
//         title: z.string().describe("Reminder title. Optional").optional().nullable(),
//         priority: z.enum(['low', 'medium', 'high']).describe("Reminder priority. Optional").optional().nullable(),
//         rrule: z.string().describe("Recurrence rule, always include DTSTART;TZID with user local timezone. Do not set if one-time reminder. Optional").optional().nullable()
//             .superRefine(validateRRule),
//         dueDate: z.string().describe("Due date in YYYY-MM-DD HH:MM. Do not set if recurring reminder. Optional").optional().nullable()
//             .superRefine((z, ctx) => {
//                 if (z)
//                     try {
//                         if (dayjs.tz(z, user.metadata?.timezone ?? 'UTC').tz('UTC').isBefore(dayjs()))
//                             ctx.addIssue('error: must be future date, ask user to set a few hours ahead')
//                     } catch (e) {
//                         if (e instanceof Error) ctx.addIssue(`Invalid timestamp ${e.message}`)
//                     }
//             }),
//         description: z.string().describe("Reminder description. Optional").optional().nullable(),
//     }).superRefine((o, ctx) => {
//         if (o.type && (o.rrule || o.dueDate)) {
//             if (o.type === 'one-time' && o.rrule) ctx.addIssue({
//                 code: 'custom',
//                 message: 'dueDate required for one-time reminders, do not set rrule',
//                 path: ['dueDate', 'rrule'],
//             })
//             else if (o.type === 'recurring' && o.dueDate) ctx.addIssue({
//                 code: 'custom',
//                 message: 'rrule required for recurring reminders, do not set dueDate',
//                 path: ['dueDate', 'rrule'],
//             })
//         }
//     }),
//     async execute(input) {
//         console.log(`${user.platform}-${user.identifier}`, "reminder.modify tool called with input:", input);

//         const updated = await db.update(reminders).set({
//             ...(input.title ? { title: input.title } : undefined),
//             ...(input.description ? { description: input.description } : undefined),
//             ...(input.priority ? { priority: input.priority } : undefined),
//             ...(input.rrule ? {
//                 rrule: RRule.fromString(input.rrule).toString(),
//                 dueAt: dayjs.tz(RRule.fromString(input.rrule).options.dtstart.toISOString(), RRule.fromString(input.rrule).origOptions.tzid ?? 'UTC').tz(RRule.fromString(input.rrule).origOptions.tzid ?? 'UTC').toDate(),
//             } : undefined),
//             ...(input.dueDate ? {
//                 dueAt: dayjs.tz(input.dueDate, user.metadata?.timezone ?? 'UTC').tz(user.metadata?.timezone ?? 'UTC').toDate(),
//             } : undefined),
//         }).where(and(
//             eq(reminders.userId, user.id),
//             eq(reminders.id, input.id),
//         )).execute()
//         console.log(`${user.platform}-${user.identifier}`, `reminder.modify updated ${updated.toString()} reminder`);
//         return encode({ success: true })
//     }
// });

const mark = (user: User) => tool({
    description: "Delete a reminder or mark as completed. If the user wants to update a reminder/task, delete the old one and create the new",
    inputSchema: z.object({
        id: z.uuidv7().describe("Reminder ID"),
        completed: z.boolean().describe("Mark the reminder as completed. Optional").optional().nullable(),
        deleted: z.boolean().describe("Mark the reminder as deleted. Optional").optional().nullable(),
    }),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "reminder.mark tool called with input:", input);
        const updated = await db.update(reminders).set({
            sent: input.completed ?? undefined,
            deleted: input.deleted ?? undefined,
        }).where(and(
            eq(reminders.userId, user.id),
            eq(reminders.id, input.id),
        )).execute()
        console.log(`${user.platform}-${user.identifier}`, `reminder.mark updated ${updated.toString()} reminders`);
        return encode({ success: true })
    }
});

export function reminderTools(user: User) {
    return {
        ...(user.metadata ? {
            createReminder: create(user),
            searchReminders: search(user),
            // updateReminder: update(user),
            createTask: createTask(user),
            markReminder: mark(user),
        } : undefined),
    }
}