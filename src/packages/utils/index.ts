import { db } from "@/server/db";
import { users as Users, messages as Messages, type User } from "@/server/db/schema";
import type { AssistantModelMessage, ToolModelMessage, UserModelMessage } from "ai";
import { asc, sql } from "drizzle-orm";

/**
 * Fetches a user from the database based on platform and chatId.
 * @param platform currently only 'telegram' is supported
 * @param chatId chatId from the platform
 * @param createIfNotExists if true, creates a new user if one does not exist
 * @returns 
 */
export async function getUserFromIdentifier(
    platform: 'telegram',
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
    platform: 'telegram',
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
 * @param tokenCount token count limit, defaults to 700
 * @returns list of recent messages in chronological order
 */
export async function getLatestMessagesForUser(user: User, tokenCount = 700) {
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