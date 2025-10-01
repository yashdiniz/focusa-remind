export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// import { env } from '@/env';
// import { WebClient } from '@slack/web-api';
import type { NextRequest } from 'next/server';
import z from 'zod';

const inputSchema = z.object({
    type: z.string(),
    token: z.string(),
    challenge: z.string(),
})

// const token = env.SLACK_BOT_TOKEN;
// if (!token) {
//     throw new Error('SLACK_BOT_TOKEN is not set');
// }

// const bot = new WebClient(token)

export async function POST(req: NextRequest) {
    const res = inputSchema.safeParse(await req.json())
    if (!res.success) {
        console.error("Invalid input to /api/webhook/slack:", res.error);
        return new Response(JSON.stringify(res.error.message), {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
            }
        })
    }

    return new Response(res.data.challenge)
}