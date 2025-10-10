export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { env } from "@/env";
import { ACCOUNTABILITY_CHECKIN_PROMPT } from "@/packages/agent";
import { botSendMessage as slackbotSendMessage } from "@/packages/slack";
import { botSendMessage as telegrambotSendMessage } from "@/packages/telegram";
import { humanTime } from "@/packages/utils";
import { db } from "@/server/db";
import { messages, reminders } from "@/server/db/schema";
import { groq } from "@ai-sdk/groq";
import { WebClient } from "@slack/web-api";
import { Experimental_Agent as Agent } from "ai";
import { eq } from "drizzle-orm";
import { Bot } from "grammy";
import type { NextRequest } from "next/server";
import { RRule } from "rrule";
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
        // reusable agent for reminder generation
        const agent = new Agent({
            model: groq('llama-3.1-8b-instant'), maxOutputTokens: 100,
            system: ACCOUNTABILITY_CHECKIN_PROMPT,
        })
        const rems = await db.query.reminders.findMany({
            where: (reminders, { lte, and, not }) => and(
                not(reminders.sent), not(reminders.deleted), lte(reminders.dueAt, new Date(body.data.timestamp.getTime() + 15 * 60 * 1000)),
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
                const gen = await agent.generate({
                    providerOptions: {
                        groq: {
                            user: `${user.platform}-${user.identifier}`, // Unique identifier for the user (optional)
                        },
                    },
                    messages: [{
                        role: 'user',
                        content: `title:${reminder.title}\ndescription:${reminder.description}\n${reminder.dueAt ? `due:${humanTime(reminder.dueAt)}` : ''}`
                    }]
                })
                await tx.insert(messages).values({
                    userId: reminder.userId,
                    role: 'assistant',
                    tokenCount: 30,
                    content: {
                        role: 'assistant',
                        content: gen.text,
                    }
                }).execute()
                await tx.update(reminders).set({
                    sent: true,
                    ...(reminder.rrule && reminder.dueAt ? {
                        // sets to false if there's another due date, otherwise sets to true
                        sent: RRule.fromString(reminder.rrule).after(reminder.dueAt) === null,
                        dueAt: RRule.fromString(reminder.rrule).after(reminder.dueAt),
                    } : null)
                }).where(eq(reminders.id, reminder.id)).execute()
                switch (user.platform) {
                    case 'slack':
                        console.log('send slack message')
                        await slackbotSendMessage(slackbot, user.identifier, gen.text)
                        break;
                    case 'telegram':
                        console.log('send telegram message')
                        await telegrambotSendMessage(telegrambot, user.identifier, gen.text)
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