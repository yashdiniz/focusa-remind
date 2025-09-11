export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { env } from '@/env';
import { botIsTyping, botSendMessage } from '@/packages/telegram';
import { Bot, webhookCallback } from 'grammy';
import { waitUntil } from '@vercel/functions';
import { generateResponse } from '@/packages/ai';

const token = env.TELEGRAM_BOT_TOKEN;
if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
}

const bot = new Bot(token);

bot.on('message:text', async (ctx) => {
    const interval = await botIsTyping(bot, ctx.chatId.toString());
    console.log(new Date(ctx.message.date * 1000).toISOString(), ctx.chatId, ctx.message.text);
    const result = await generateResponse(ctx.chatId.toString(), ctx.message.text);
    waitUntil(
        botSendMessage(bot, ctx.chatId.toString(), result.trim(),
            ctx.message.message_id, interval) // Echo the received message
    );
});

export const POST = webhookCallback(bot, 'std/http');