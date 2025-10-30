'use server'
import { env } from '@/env';
import { db } from '@/server/db';
import { validate, parse } from '@tma.js/init-data-node'

type Session = ReturnType<typeof parse>;

export function getSession(authData: string): Session | null {
    try {
        validate(authData, env.TELEGRAM_BOT_TOKEN, {
            expiresIn: 600, // 10 minutes
        });
        return parse(authData)
    } catch (e) {
        console.error('Init data validation failed:', e)
        return null
    }
}

async function getUserFromSession(authData: string) {
    const session = getSession(authData)
    if (!session || !session.chat) return null
    console.log('session', session)

    const user = await db.query.users.findFirst({
        where: (users, { and, eq }) => and(
            eq(users.platform, 'telegram'), eq(users.identifier, session.chat?.id.toString() ?? '')
        )
    }).execute()
    if (!user) return null
    return user
}

export async function getRemindersForSession(authData: string) {
    const user = await getUserFromSession(authData)
    if (!user) return null

    const reminders = await db.query.reminders.findMany({
        where: (reminders, { eq }) => eq(reminders.userId, user.id),
        orderBy: (reminders, { desc }) => desc(reminders.createdAt),
    }).execute()

    return reminders;
}