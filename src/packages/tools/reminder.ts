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
import { and, eq, gte, ilike, inArray, isNotNull, lte, or } from "drizzle-orm";
dayjs.extend(utc)
dayjs.extend(timezone)

const RetrievalSchema = (user: User) => z.object({
    from: z.string().describe("start datetime for the due date search in YYYY-MM-DD HH:MM. Optional")
        .superRefine((z, ctx) => {
            if (z)
                try {
                    if (dayjs.tz(z, user.metadata?.timezone ?? 'UTC').tz('UTC').isAfter(dayjs()))
                        ctx.addIssue('error: must be past date')
                } catch (e) {
                    if (e instanceof Error) ctx.addIssue(`Invalid timestamp ${e.message}`)
                }
        }),
    to: z.string().describe("end datetime for the due date search in YYYY-MM-DD HH:MM. Optional")
        .superRefine((z, ctx) => {
            if (z)
                try {
                    if (dayjs.tz(z, user.metadata?.timezone ?? 'UTC').tz('UTC').isAfter(dayjs()))
                        ctx.addIssue('error: must be past date')
                } catch (e) {
                    if (e instanceof Error) ctx.addIssue(`Invalid timestamp ${e.message}`)
                }
        }),
    keywords: z.array(z.string()).describe("keywords to search in title/description. Optional"),
    includeCompleted: z.boolean().describe("whether to include completed reminders").default(false),
    recurring: z.boolean().describe("whether to filter only recurring reminders").default(false),
}).partial().superRefine((o, ctx) => {
    if (o.from && o.to && dayjs(o.from).isAfter(dayjs(o.to))) ctx.addIssue("from must be before to in search")
})

function searchQuery(user: User, input: unknown) {
    const { from, to, includeCompleted, recurring, keywords } = RetrievalSchema(user).parse(input)
    return and(
        from ? gte(reminders.dueAt, dayjs.tz(from, user.metadata?.timezone ?? 'UTC').tz('UTC').toDate()) : undefined,
        to ? lte(reminders.dueAt, dayjs.tz(to, user.metadata?.timezone ?? 'UTC').tz('UTC').toDate()) : undefined,
        eq(reminders.sent, includeCompleted ?? false),
        recurring ? isNotNull(reminders.rrule) : undefined,
        keywords && keywords.length > 0 ? or(
            ...keywords.map(kw => or(ilike(reminders.title, `%${kw}%`), ilike(reminders.description, `%${kw}%`)))
        ) : undefined,
    )
}

const create = (user: User, client: Supermemory) => tool({
    name: "reminder.create",
    description: "Create reminder. One-time reminders have due date. Recurring reminders have rrule. Set either one, not both. If no time provided, assume user means a few hours ahead. Share output of `repeats` with user to confirm",
    inputSchema: z.object({
        title: z.string().describe("Reminder title"),
        type: z.enum(['one-time', 'recurring']).describe("one-time or recurring reminder"),
        priority: z.enum(['low', 'medium', 'high']).describe("assume reminder priority").default('low'),
        rrule: z.string().describe("Recurrence rule, always include DTSTART;TZID with user local timezone. Optional").optional()
            .superRefine(validateRRule),
        dueDate: z.string().describe("Due date in YYYY-MM-DD HH:MM. Optional").optional()
            .superRefine((z, ctx) => {
                if (z)
                    try {
                        if (dayjs.tz(z, user.metadata?.timezone ?? 'UTC').tz('UTC').isBefore(dayjs()))
                            ctx.addIssue('error: must be future date, ask user to set a few hours ahead')
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
            const setAt = dayjs.tz(input.dueDate, user.metadata?.timezone ?? 'UTC').tz(user.metadata?.timezone ?? 'UTC').toDate()
            rem.dueAt = setAt
            rem.repeats = humanTime(setAt)
        }
        const reminder = await db.insert(reminders).values(rem).returning().execute()
        if (reminder && reminder.length === 1 && reminder[0]?.id) {
            if (input.type === 'recurring') await client.memories.add({
                content: `User added a new reminder: ${reminderListToString(user, reminder)}`,
                containerTag: `user_${user.platform}-${user.identifier}`,
            })
            // await updateBio(user, '')
            console.log(`${user.platform}-${user.identifier}`, "reminder.create occured", reminder[0]);
            return { id: reminder[0].id, repeats: rem.repeats, setAt: rem.dueAt }
        }
        throw new Error('Could not create reminder!')
    },
});

const show = (user: User) => tool({
    name: "reminder.show",
    description: "Search (list/display) matching reminders. Run only when reminder details are not already in ReminderList. Leave both ids and search undefined to get all reminders, else must set any one of ids or search, not both",
    inputSchema: z.object({
        ids: z.array(z.uuidv7()).describe("list of reminder IDs. Optional").nullable(),
        search: RetrievalSchema(user).describe("search for reminders. only set necessary fields, else undefined. Optional").nullable(),
    }).partial().superRefine((o, ctx) => {
        if (o.ids && o.search) ctx.addIssue("must set any one of ids or search, not both")
    }),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "reminder.show tool called with input:", input);
        const reminders = await db.query.reminders.findMany({
            where: (reminders, { and, eq, inArray }) => and(
                eq(reminders.userId, user.id),
                input.ids ? inArray(reminders.id, input.ids) : undefined,
                input.search ? searchQuery(user, input.search) : undefined,
            )
        }).execute()
        console.log(`${user.platform}-${user.identifier}`, `reminder.show found ${reminders.length} reminders`);
        return reminders.map(r => ({
            id: r.id,
            title: r.title, sent: r.sent, deleted: r.deleted, priority: r.priority,
            ...(r.description ? { description: r.description } : undefined),
            ...(r.dueAt ? { dueDate: dayjs(r.dueAt).tz(user.metadata?.timezone ?? 'UTC').format('YYYY-MM-DD HH:mm') } : undefined),
            ...(r.rrule ? { rrule: r.rrule } : undefined),
        }));
    },
});

const modifyOne = (user: User) => tool({
    name: "reminder.modify",
    description: "Modify existing reminder. Only set fields that need to be updated. To mark as completed/deleted, set the respective boolean to true",
    inputSchema: z.object({
        id: z.uuidv7().describe("Reminder ID"),
        type: z.enum(['one-time', 'recurring']).describe("one-time or recurring reminder. Optional").optional().nullable(),
        completed: z.boolean().describe("Mark the reminder as completed. Optional").optional().nullable(),
        deleted: z.boolean().describe("Mark the reminder as deleted. Optional").optional().nullable(),
        title: z.string().describe("Reminder title. Optional").optional().nullable(),
        priority: z.enum(['low', 'medium', 'high']).describe("Reminder priority. Optional").optional().nullable(),
        rrule: z.string().describe("Recurrence rule, always include DTSTART;TZID with user local timezone. Optional").optional().nullable()
            .superRefine(validateRRule),
        dueDate: z.string().describe("Due date in YYYY-MM-DD HH:MM. Optional").optional().nullable()
            .superRefine((z, ctx) => {
                if (z)
                    try {
                        if (dayjs.tz(z, user.metadata?.timezone ?? 'UTC').tz('UTC').isBefore(dayjs()))
                            ctx.addIssue('error: must be future date, ask user to set a few hours ahead')
                    } catch (e) {
                        if (e instanceof Error) ctx.addIssue(`Invalid timestamp ${e.message}`)
                    }
            }),
        description: z.string().describe("Reminder description. Optional").optional().nullable(),
    }).superRefine((o, ctx) => {
        if (o.type && (o.rrule || o.dueDate)) {
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
        }
    }),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "reminder.modify tool called with input:", input);
        const updated = await db.update(reminders).set({
            ...(input.title ? { title: input.title } : undefined),
            ...(input.description ? { description: input.description } : undefined),
            ...(input.priority ? { priority: input.priority } : undefined),
            ...(input.rrule ? { rrule: input.rrule } : undefined),
            dueAt: input.dueDate ? dayjs.tz(input.dueDate, user.metadata?.timezone ?? 'UTC').tz(user.metadata?.timezone ?? 'UTC').toDate() : undefined,
            sent: input.completed ?? undefined,
            deleted: input.deleted ?? undefined,
        }).where(and(
            eq(reminders.userId, user.id),
            eq(reminders.id, input.id),
        )).execute()
        console.log(`${user.platform}-${user.identifier}`, `reminder.modify updated ${updated.toString()} reminder`);
        return 'reminder has been updated'
    }
});

const modifyBulk = (user: User) => tool({
    name: "reminder.bulkModify",
    description: "Mark multiple reminders as completed or deleted. Must set any one of ids or search, not both",
    inputSchema: z.object({
        ids: z.array(z.uuidv7()).describe("list of reminder IDs. Optional").nullable(),
        search: RetrievalSchema(user).describe("search for reminders. only set necessary fields, else undefined. Optional").nullable(),
        completed: z.boolean().describe("Mark the reminder as completed. Optional").nullable(),
        deleted: z.boolean().describe("Mark the reminder as deleted. Optional").nullable(),
    }).partial().superRefine((o, ctx) => {
        if (!(o.ids || o.search) || (o.ids && o.search)) ctx.addIssue("must set any one of ids or search, not both")
    }),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "reminder.bulkModify tool called with input:", input);
        const updated = await db.update(reminders).set({
            sent: input.completed ?? undefined,
            deleted: input.deleted ?? undefined,
        }).where(and(
            eq(reminders.userId, user.id),
            input.ids ? inArray(reminders.id, input.ids) : undefined,
            input.search ? searchQuery(user, input.search) : undefined,
        )).execute()
        console.log(`${user.platform}-${user.identifier}`, `reminder.bulkModify updated ${updated.toString()} reminders`);
        return 'reminders have been updated'
    }
});

export function reminderTools(user: User, client: Supermemory) {
    return {
        ...(user.metadata ? {
            "reminder.create": create(user, client),
            "reminder.show": show(user),
            "reminder.modify": modifyOne(user),
            "reminder.bulkModify": modifyBulk(user),
        } : undefined),
    }
}