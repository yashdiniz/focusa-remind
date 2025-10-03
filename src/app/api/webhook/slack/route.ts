export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { env } from '@/env';
import { WebClient } from '@slack/web-api';
import type { NextRequest } from 'next/server';
import z from 'zod';

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
const bot = new WebClient(env.SLACK_BOT_TOKEN)

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
    const body = inputSchema.safeParse(await req.json())
    if (!body.success) {
        console.error("Invalid input to /api/webhook/slack:", body.error);
        return new Response(body.error.message, {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
            }
        })
    }

    console.log('slack webhook invocation', body.data)
    if (body.data.type === 'url_verification') {
        return new Response(body.data.challenge)
    }
    if (body.data.type === 'event_callback') {
        await bot.chat.postMessage({
            channel: body.data.event.channel,
            markdown_text: 'Echo:\n' + body.data.event.text,
        })
    }

    // otherwise ECHO back
    return new Response(JSON.stringify(body.data), {
        headers: {
            'Content-Type': 'application/json',
        }
    })
}