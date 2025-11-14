export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { env } from "@/env";
import { ACCOUNTABILITY_CHECKIN_PROMPT } from "@/packages/agent";
import { botSendMessage as slackbotSendMessage } from "@/packages/slack";
import { botSendMessage as telegrambotSendMessage } from "@/packages/telegram";
import { getLatestMessagesForUser, humanTime } from "@/packages/utils";
import { db } from "@/server/db";
import { messages, reminders } from "@/server/db/schema";
import { groq } from "@ai-sdk/groq";
import { WebClient } from "@slack/web-api";
import { encode } from "@toon-format/toon";
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
            where: (reminders, { lte, and, not, isNotNull }) => and(
                not(reminders.deleted), and(isNotNull(reminders.rrule), eq(reminders.sent, false)),
                lte(reminders.dueAt, new Date(body.data.timestamp.getTime() + 15 * 60 * 1000)),
            ),
            with: {
                user: true
            }
        }).execute()
        console.log('fetched reminders', rems.length)
        const u_rems: Record<string, (typeof rems)> = {}
        for (const reminder of rems) {
            const userId = reminder.userId
            if (!u_rems[userId]) u_rems[userId] = [reminder]
            else u_rems[userId].push(reminder)
        }
        for (const userId in u_rems) {
            const rems = u_rems[userId]!
            const user = rems[0]!.user
            const msgs = await getLatestMessagesForUser(user)
            await db.transaction(async tx => {
                const gen = await agent.generate({
                    providerOptions: {
                        groq: {
                            user: `${user.platform}-${user.identifier}`, // Unique identifier for the user (optional)
                        },
                    },
                    messages: [
                        ...msgs,
                        {
                            role: 'user',
                            content: encode(rems.map(v => ({
                                title: v.title, description: v.description, ...(v.dueAt ? { due: humanTime(v.dueAt) } : undefined),
                            })))
                        }
                    ]
                })
                await tx.insert(messages).values({
                    userId, role: 'assistant',
                    tokenCount: 30,
                    content: {
                        role: 'assistant',
                        content: gen.text,
                    }
                }).execute()
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
                for (const reminder of rems)
                    await tx.update(reminders).set({
                        // reminders stop sending only after due date. (basically remind multiple times every 15 minutes)
                        sent: reminder.dueAt !== null && (reminder.dueAt.getTime() <= Date.now()),
                        ...(reminder.rrule && reminder.dueAt ? {
                            // sets to false if there's another due date, otherwise sets to true
                            sent: RRule.fromString(reminder.rrule).after(reminder.dueAt) === null,
                            dueAt: RRule.fromString(reminder.rrule).after(reminder.dueAt),
                        } : null)
                    }).where(eq(reminders.id, reminder.id)).execute()
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