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
    from: z.string().describe("start datetime for the due date search in YYYY-MM-DD HH:MM. Optional").optional()
        .superRefine((z, ctx) => {
            if (z)
                try {
                    if (dayjs.tz(z, user.metadata?.timezone ?? 'UTC').tz('UTC').isAfter(dayjs()))
                        ctx.addIssue('error: must be past date')
                } catch (e) {
                    if (e instanceof Error) ctx.addIssue(`Invalid timestamp ${e.message}`)
                }
        }),
    to: z.string().describe("end datetime for the due date search in YYYY-MM-DD HH:MM. Optional").optional()
        .superRefine((z, ctx) => {
            if (z)
                try {
                    if (dayjs.tz(z, user.metadata?.timezone ?? 'UTC').tz('UTC').isAfter(dayjs()))
                        ctx.addIssue('error: must be past date')
                } catch (e) {
                    if (e instanceof Error) ctx.addIssue(`Invalid timestamp ${e.message}`)
                }
        }),
    keywords: z.array(z.string()).describe("keywords to search in title/description. Optional").optional(),
    include_sent: z.boolean().describe("whether to include sent reminders").default(false),
    is_recurring: z.boolean().describe("whether to filter only recurring reminders").default(false),
}).superRefine((o, ctx) => {
    if (o.from && o.to && dayjs(o.from).isAfter(dayjs(o.to))) ctx.addIssue("from must be before to in search")
})

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
    description: "Search (list/display) matching reminders. Run only when reminder details are not already in ReminderList. must set any one of ids or search, not both",
    inputSchema: z.object({
        ids: z.array(z.uuidv7()).describe("list of reminder IDs. Optional").optional(),
        search: RetrievalSchema(user).optional(),
    }).superRefine((o, ctx) => {
        if (!(o.ids || o.search) || (o.ids && o.search)) ctx.addIssue("must set any one of ids or search, not both")
    }),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "reminder.show tool called with input:", input);
        const reminders = await db.query.reminders.findMany({
            where: (reminders, { and, or, eq, gte, lte, ilike, inArray }) => {
                const searchQuery = and(
                    input.search?.from ? gte(reminders.dueAt, dayjs.tz(input.search.from, user.metadata?.timezone ?? 'UTC').tz('UTC').toDate()) : undefined,
                    input.search?.to ? lte(reminders.dueAt, dayjs.tz(input.search.from, user.metadata?.timezone ?? 'UTC').tz('UTC').toDate()) : undefined,
                    eq(reminders.sent, input.search?.include_sent ?? false),
                    input.search?.is_recurring ? isNotNull(reminders.rrule) : undefined,
                    input.search?.keywords && input.search.keywords.length > 0 ? or(
                        ...input.search.keywords.map(kw => or(ilike(reminders.title, `%${kw}%`), ilike(reminders.description, `%${kw}%`)))
                    ) : undefined,
                )
                return and(
                    eq(reminders.userId, user.id),
                    input.ids ? inArray(reminders.id, input.ids) : undefined,
                    input.search ? searchQuery : undefined,
                )
            }
        }).execute()
        console.log(`${user.platform}-${user.identifier}`, `reminder.show found ${reminders.length} reminders`);
        return reminders;
    },
});

const modify = (user: User) => tool({
    name: "reminder.modify",
    description: "Modify existing reminder. Only non-null fields will be updated. To mark as sent/deleted, set the respective boolean to true",
    inputSchema: z.object({
        isBulkMutation: z.boolean().describe("set if attempting bulk mutation"),
        ids: z.array(z.uuidv7()).describe("list of reminder IDs. Optional").optional(),
        search: RetrievalSchema(user).optional(),
        isSent: z.boolean().describe("boolean to mark the reminder as completed").optional(),
        isDeleted: z.boolean().describe("boolean to mark the reminder as deleted").optional(),
        title: z.string().describe("Reminder title").optional(),
        priority: z.enum(['low', 'medium', 'high']).describe("assume reminder priority").optional(),
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
        if (!o.isBulkMutation) {
            if (!o.ids) ctx.addIssue("must set ids since not bulk mutation")
            if (o.ids?.length !== 1) ctx.addIssue("ids must contain exactly one ID when not bulk mutation")
        }
        if (o.isBulkMutation) {
            if (o.title || o.description || o.dueDate || o.rrule || o.priority) ctx.addIssue("cannot set title, description, dueDate, rrule or priority in bulk mutation")
            if (o.isSent == undefined && o.isDeleted == undefined) ctx.addIssue("mark any one of isSent or isDeleted in bulk mutation")
            if (!(o.ids || o.search) || (o.ids && o.search)) ctx.addIssue("must set any one of ids or search, not both")
        }
    }),
    async execute(input) {
        const searchQuery = and(
            input.search?.from ? gte(reminders.dueAt, dayjs.tz(input.search.from, user.metadata?.timezone ?? 'UTC').tz('UTC').toDate()) : undefined,
            input.search?.to ? lte(reminders.dueAt, dayjs.tz(input.search.from, user.metadata?.timezone ?? 'UTC').tz('UTC').toDate()) : undefined,
            eq(reminders.sent, input.search?.include_sent ?? false),
            input.search?.is_recurring ? isNotNull(reminders.rrule) : undefined,
            input.search?.keywords && input.search.keywords.length > 0 ? or(
                ...input.search.keywords.map(kw => or(ilike(reminders.title, `%${kw}%`), ilike(reminders.description, `%${kw}%`)))
            ) : undefined,
        )
        if (input.dueDate)
            await db.update(reminders).set({
                title: input.title ?? undefined,
                description: input.description ?? undefined,
                priority: input.priority ?? undefined,
                rrule: input.rrule ?? undefined,
                dueAt: input.dueDate ? dayjs.tz(input.dueDate, user.metadata?.timezone ?? 'UTC').tz(user.metadata?.timezone ?? 'UTC').toDate() : undefined,
            }).where(and(
                eq(reminders.userId, user.id),
                input.ids ? inArray(reminders.id, input.ids) : undefined,
                input.search ? searchQuery : undefined,
            ))
        return true
    }
});

export function reminderTools(user: User, client: Supermemory) {
    return {
        ...(user.metadata ? {
            "reminder.create": create(user, client),
            "reminder.show": show(user),
            "reminder.modify": modify(user),
        } : undefined),
    }
}