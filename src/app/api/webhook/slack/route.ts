export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { env } from '@/env';
import { replyFromHistory } from '@/packages/ai';
import { updateMemoryAgent } from '@/packages/memory';
import { botSendMessage } from '@/packages/slack';
import { getLatestMessagesForUser, getUserFromIdentifier, saveMessagesForUser } from '@/packages/utils';
import { WebClient } from '@slack/web-api';
import { encode } from '@toon-format/toon';
import { waitUntil } from '@vercel/functions';
import { encodingForModel } from 'js-tiktoken';
import type { NextRequest } from 'next/server';
import z from 'zod';

const token = env.SLACK_BOT_TOKEN
if (!token) throw new Error('SLACK_BOT_TOKEN is not set');
const bot = new WebClient(token)

const inputSchema = z.object({
    type: z.enum([
        'url_verification',
        'event_callback',
    ]),
    token: z.string(),
    challenge: z.string().optional(),
    event: z.object({
        type: z.enum(['message']),
        channel: z.string(),
        user: z.string(),
        text: z.string(),
        channel_type: z.enum(['im']),
    }),
})

export async function POST(req: NextRequest) {
    const payload: unknown = await req.json()
    console.log('Slack sent:', JSON.stringify(payload))
    const body = inputSchema.safeParse(payload)
    if (!body.success) {
        console.error("Invalid input to /api/webhook/slack:", body.error);
        return new Response(body.error.message, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            }
        })
    }
    // quickly respond with challenge
    if (body.data.type === 'url_verification') {
        return new Response(body.data.challenge)
    }
    // quickly respond with unsupported message types
    if (body.data.type !== 'event_callback') {
        await botSendMessage(bot, body.data.event.channel, 'You cannot communicate with me this way just yet!')
    }
    // skip replying if the user message received is from the bot itself
    if (body.data.event.user === env.SLACK_BOT_USER) {
        return new Response(JSON.stringify(body.data), {
            headers: {
                'Content-Type': 'application/json',
            }
        })
    }

    try {
        const user = await getUserFromIdentifier('slack', body.data.event.channel, true)
        if (!user) {
            console.error('User not found for chatId', body.data.event.channel)
            return new Response('User not found', { status: 401 })
        }

        const msgs = await getLatestMessagesForUser(user);
        console.log(`${user.platform}-${user.identifier}`, 'Loaded', msgs.length, 'messages from history for user');

        if (!user.metadata) {
            const info = await bot.users.info({ user: body.data.event.user })
            if (!info.ok) {
                console.error('Could not fetch user info', info.error)
                return new Response('User info fetch failed', { status: 403 })
            }
            // assist user onboarding with slack info
            msgs.push({
                role: 'user',
                content: `Data from slack to assist onboarding:\n${encode(info)}`
            })
        }

        msgs.push({ role: 'user', content: body.data.event.text })

        const result = await replyFromHistory(msgs, user);

        // Save user message and assistant response in a transaction
        const responses = result.response.messages.map((m, i) => ({ ...m, tokenCount: i == result.response.messages.length - 1 ? (result.usage.outputTokens ?? 512) : 0 }))
        await saveMessagesForUser(user, [
            // TODO: use the correct tokenizer based on the model used to get the correct token count
            { role: 'user', content: body.data.event.text, tokenCount: encodingForModel('gpt-3.5-turbo').encode(body.data.event.text).length },
            ...responses, // Don't save system messages
        ])

        waitUntil((async () => {
            if (!result.text.trim()) await botSendMessage(bot, body.data.event.channel, "ℹ️ _bot replied with empty text_")
            else await botSendMessage(bot, body.data.event.channel, result.text.trim())
            const agent = updateMemoryAgent(user)
            const res = await agent.generate({
                messages: msgs,
                providerOptions: {
                    groq: {
                        user: `${user.platform}-${user.identifier}`, // Unique identifier for the user (optional)
                    }
                }
            })
            const responses = res.response.messages.map((m) => ({ ...m, tokenCount: 0 })).filter(v => v.role === 'tool')
            await saveMessagesForUser(user, responses)
            console.log('telegram webhook updateMemoryAgent:', res.content)
        })())
    } catch (e) {
        console.error('Error processing message:', e)
        await botSendMessage(bot, body.data.event.channel, '⚠️ Sorry, something went wrong while processing your message. Please try again later.')
        return new Response('Error processing message', { status: 500 })
    }

    // otherwise ECHO back
    return new Response(JSON.stringify(body.data), {
        headers: {
            'Content-Type': 'application/json',
        }
    })
}