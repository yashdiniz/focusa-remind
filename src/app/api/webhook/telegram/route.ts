export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { env } from '@/env';
import { botIsTyping, botSendMessage } from '@/packages/telegram';
import { Bot, webhookCallback } from 'grammy';
import { waitUntil } from '@vercel/functions';
import { generateResponse, SYSTEM_PROMPT } from '@/packages/ai';

const token = env.TELEGRAM_BOT_TOKEN;
if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
}

const bot = new Bot(token);

bot.on('message:text', async (ctx) => {
    const interval = await botIsTyping(bot, ctx.chatId.toString());
    console.log(new Date(ctx.message.date * 1000).toISOString(), ctx.chatId, ctx.message.text);
    // TODO: Get message history from a database
    const result = await generateResponse([
        {
            role: 'system',
            content: SYSTEM_PROMPT,
        },
        {
            role: 'user',
            content: ctx.message.text,
        }
    ], ctx.chatId.toString());
    waitUntil(
        botSendMessage(bot, ctx.chatId.toString(), result.trim(),
            ctx.message.message_id, interval) // Echo the received message
    );
});

export const POST = webhookCallback(bot, 'std/http');