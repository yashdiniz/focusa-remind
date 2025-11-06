import { db } from "@/server/db";
import { users as Users, messages as Messages, type User, type ReminderSelect } from "@/server/db/schema";
import type { AssistantModelMessage, ToolModelMessage, UserModelMessage } from "ai";
import { asc, sql } from "drizzle-orm";
import { RRule, rrulestr } from "rrule";
import type z from "zod";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Checks if a given timezone string is valid according to the Intl.DateTimeFormat API.
 * @param tz timezone string to validate
 * @returns boolean indicating if the timezone is valid
 */
export function validateTimezone(tz: string) {
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
        if (e instanceof Error) console.error('Invalid timezone provided:', tz, e.message);
        return false;
    }
}

/**
 * Checks if a given RFC5545 RRULE string is valid using rrule.js
 * Expect tzid and dtstart to always be set.
 * @param rrule rrule string to validate
 * @returns boolean indicating if the rrule is valid
 */
export function validateRRule(rrule: string | null | undefined, ctx: z.core.$RefinementCtx<string | null | undefined>): void {
    if (rrule) {
        try {
            const r = RRule.fromString(rrule)
            if (!(r.origOptions.tzid && r.origOptions.dtstart)) {
                ctx.addIssue("missing or incorrect DTSTART;TZID, example: DTSTART;TZID=Australia/Perth:20251001T085900")
            }
        } catch (e) {
            if (e instanceof Error) {
                console.error('Invalid rrule', rrule, e.message);
                ctx.addIssue(`Invalid rrule ${e.message}`)
            }
        }
    }
}

/**
 * Print a human readable timestamp to the terminal given a number representing seconds.
 * EDIT: modified for typescript
 *
 * Original Author: Dave Eddy <dave@daveeddy.com>
 * Date: 8/18/2014
 * License: MIT
 */
export function humanTime(seconds: Date | number) {
    if (seconds instanceof Date) seconds = Math.round((Date.now() - seconds.getTime()) / 1000);
    const suffix = seconds < 0 ? 'from now' : 'ago';
    seconds = Math.abs(seconds);

    const times = [
        seconds / 60 / 60 / 24 / 365, // years
        seconds / 60 / 60 / 24 / 30,  // months
        seconds / 60 / 60 / 24 / 7,   // weeks
        seconds / 60 / 60 / 24,       // days
        seconds / 60 / 60,            // hours
        seconds / 60,                 // minutes
        seconds                       // seconds
    ];
    const names = ['year', 'month', 'week', 'day', 'hour', 'minute', 'second'];

    for (let i = 0; i < names.length; i++) {
        const time = Math.floor(times[i]!);
        let name = names[i]!;
        if (time > 1)
            name += 's';

        if (time >= 1)
            return `${time} ${name} ${suffix}`;
    }
    return '0 seconds ' + suffix;
}

/**
 * Gets the content of a URL as a Buffer.
 */
export async function getUrlAsBuffer(url: string): Promise<Buffer> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error('Error fetching URL:', error);
        throw error;
    }
}

/**
 * Fetches a user from the database based on platform and chatId/channelId.
 * @param platform currently only 'telegram' & 'slack' is supported
 * @param chatId chatId from the platform
 * @param createIfNotExists if true, creates a new user if one does not exist
 * @returns 
 */
export async function getUserFromIdentifier(
    platform: 'telegram' | 'slack',
    chatId: string, createIfNotExists = false
) {
    const q = db.query.users.findFirst({
        where: (users, { eq, and }) => and(eq(users.platform, platform), eq(users.identifier, chatId)),
    });
    const user = await q.execute();
    if (!user) {
        if (createIfNotExists) return createUser(platform, chatId);
        throw new Error('Failed to get user for chatId: ' + chatId);
    }
    return user;
}

/**
 * Creates a new user in the database.
 * @param platform currently only 'telegram' is supported
 * @param chatId chatId from the platform
 * @returns 
 */
export async function createUser(
    platform: 'telegram' | 'slack',
    chatId: string
) {
    const result = await db.insert(Users).values({
        platform,
        identifier: chatId.toString(),
    }).returning().execute();
    if (result.length === 0) {
        throw new Error('Failed to create user for chatId: ' + chatId);
    }
    return result[0];
}

/**
 * Get latest messages for a user up to a certain token count.
 * @param user user session
 * @param tokenCount token count limit, defaults to 250
 * @returns list of recent messages in chronological order
 */
export async function getLatestMessagesForUser(user: User, tokenCount = 250) {
    // Note: Drizzle ORM does not currently support window functions, so using raw SQL here.
    // This query calculates a running total of tokenCount,
    // returning messages until the cumulative token count exceeds the limit.
    const res = await db.execute(sql`
        SELECT t.id FROM (
            SELECT ${Messages.id},
                    SUM(${Messages.tokenCount}) OVER (ORDER BY ${Messages.sentAt} DESC) AS cumulative_token_count
            FROM ${Messages}
            WHERE ${Messages.userId} = ${user.id}
            ORDER BY ${Messages.sentAt} DESC
            limit 50
        ) t
        WHERE t.cumulative_token_count <= ${tokenCount}
    `).execute();
    const ids = res.map(r => r.id as string);
    const messages = await db.query.messages.findMany({
        where: (msg, { inArray }) => inArray(msg.id, ids),
        orderBy: (msg) => [asc(msg.sentAt)],
    }).execute();
    return messages.map(m => m.content);
}

export async function saveMessagesForUser(user: User,
    messages: ((UserModelMessage | AssistantModelMessage | ToolModelMessage) & { tokenCount: number })[]
) {
    const values = messages.map(msg => ({
        userId: user.id,
        role: msg.role,
        content: msg,
        tokenCount: msg.tokenCount,
    }));
    return await db.insert(Messages).values(values).returning().execute();
}

export function reminderListToString(user: User, reminders: ReminderSelect[]) {
    return `<ReminderList> ${reminders.map(({ deleted, priority, sent, title, dueAt, rrule, description }) => {
        const time = dueAt ? `due ${humanTime(dueAt)}, on ${dayjs(dueAt).tz(user.metadata?.timezone ?? 'UTC').format('YYYY-MM-DD HH:mm')}` : 'no due date'
        const recurs = rrule ? `repeats ${rrulestr(rrule).toText()}` : 'one-off'
        const desc = description ?? 'no description'
        return `- ${deleted || sent ? 'done/removed' : 'pending'}; priority ${priority}; ${time}; ${recurs}; ${title}; ${desc}`
    }).join('\n')} </ReminderList>`
}

// export async function updateBio(user: User, new_summary: string) {
//     if (user.metadata) {
//         const reminders = await db.query.reminders.findMany({
//             where: (reminders, { eq, and }) => and(
//                 eq(reminders.userId, user.id),
//                 // NOTE: PROBLEM! Would never get flagged for removal (since it would be filtered out)
//                 // not(reminders.sent), not(reminders.deleted),
//             ),
//             orderBy: (reminders, { desc }) => [desc(reminders.dueAt), desc(reminders.createdAt)],
//             limit: 20,
//         }).execute()
//         const summary = await generateSummaryPrompt(user, new_summary, reminders);
//         await db.update(users).set({
//             metadata: {
//                 ...user.metadata,
//                 summary,
//             }
//         }).where(eq(users.id, user.id)).execute();
//         return summary;
//     }
//     throw new Error('cannot update bio without onboarding')
// }