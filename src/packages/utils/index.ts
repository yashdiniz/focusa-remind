import { db } from "@/server/db";
import { users as Users, messages as Messages, type User } from "@/server/db/schema";
import type { AssistantModelMessage, ToolModelMessage, UserModelMessage } from "ai";
import { desc } from "drizzle-orm";

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

export async function getLatestMessagesForUser(user: User, limit = 20) {
    const messages = await db.query.messages.findMany({
        where: (msg, { eq, and, gte }) => and(
            eq(msg.userId, user.id),
            gte(msg.sentAt, new Date(Date.now() - 6 * 60 * 60 * 1000)), // last 6 hours
        ),
        orderBy: (msg) => [desc(msg.sentAt)],
        limit,
    }).execute();
    return messages.map(m => m.content).reverse(); // Return in chronological order
}

export async function saveMessagesForUser(user: User, messages: (UserModelMessage | AssistantModelMessage | ToolModelMessage)[]) {
    const values = messages.map(msg => ({
        userId: user.id,
        role: msg.role,
        content: msg,
    }));
    return await db.insert(Messages).values(values).returning().execute();
}