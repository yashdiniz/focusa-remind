export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { env } from "@/env";
import { ACCOUNTABILITY_CHECKIN_PROMPT } from "@/packages/agent";
import { botSendMessage as slackbotSendMessage } from "@/packages/slack";
import { botSendMessage as telegrambotSendMessage } from "@/packages/telegram";
import { db } from "@/server/db";
import { messages, reminders } from "@/server/db/schema";
import { WebClient } from "@slack/web-api";
import { eq } from "drizzle-orm";
import { Bot } from "grammy";
import type { NextRequest } from "next/server";
import z from "zod";

const inputSchema = z.object({
    timestamp: z.coerce.date(),
})

const slackbot = new WebClient(env.SLACK_BOT_TOKEN)
const telegrambot = new Bot(env.TELEGRAM_BOT_TOKEN)

export async function POST(req: NextRequest) {
    // Simple auth for testing endpoint
    if (req.headers.get("x-api-key") !== env.AUTH_SECRET) {
        return new Response("Unauthorized", { status: 401 });
    }

    const body = inputSchema.safeParse(await req.json())
    if (!body.success) {
        console.error('Invalid input to /api/webhook/n8n:', body.error)
        return new Response(body.error.message, {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    try {
        const rems = await db.query.reminders.findMany({
            where: (reminders, { lte, and, not }) => and(
                not(reminders.sent), not(reminders.deleted), lte(reminders.dueAt, body.data.timestamp),
            ),
            with: {
                user: {
                    columns: {
                        platform: true,
                        identifier: true,
                    }
                }
            }
        }).execute()
        console.log('fetched reminders', rems.length)
        for (const reminder of rems) {
            await db.transaction(async tx => {
                const user = reminder.user
                const text = `Hey, just wanted to remind you!\n${reminder.title}\n${reminder.description}`.trim()
                await tx.insert(messages).values({
                    userId: reminder.userId,
                    role: 'user',
                    tokenCount: 40,
                    content: {
                        role: 'user',
                        content: ACCOUNTABILITY_CHECKIN_PROMPT,
                    }
                }).execute()
                await tx.insert(messages).values({
                    userId: reminder.userId,
                    role: 'assistant',
                    tokenCount: 30,
                    content: {
                        role: 'assistant',
                        content: text,
                    }
                }).execute()
                await tx.update(reminders).set({ sent: true }).where(eq(reminders.id, reminder.id)).execute()
                switch (user.platform) {
                    case 'slack':
                        console.log('send slack message')
                        await slackbotSendMessage(slackbot, user.identifier, text)
                        break;
                    case 'telegram':
                        console.log('send telegram message')
                        await telegrambotSendMessage(telegrambot, user.identifier, text)
                        break;
                }
            })
        }
        return new Response('success!')
    } catch (e) {
        if (e instanceof Error) {
            return new Response(`Error processing request: ${e.message}`, { status: 500 });
        }
        console.error("Error in /api/webhook/n8n:", e);
        return new Response(`Error processing request: unknown`, { status: 500 });
    }
}