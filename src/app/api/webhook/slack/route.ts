export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// import { env } from '@/env';
// import { WebClient } from '@slack/web-api';
import type { NextRequest } from 'next/server';
import z from 'zod';

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

// const token = env.SLACK_BOT_TOKEN;
// if (!token) {
//     throw new Error('SLACK_BOT_TOKEN is not set');
// }

// const bot = new WebClient(token)

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
        return new Response(body.data.event.text)
    }

    // otherwise ECHO back
    return new Response(JSON.stringify(body.data), {
        headers: {
            'Content-Type': 'application/json',
        }
    })
}