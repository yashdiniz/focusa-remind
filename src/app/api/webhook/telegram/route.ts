export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { env } from '@/env';
import { botIsTyping, botSendMessage } from '@/packages/telegram';
import { Bot, webhookCallback } from 'grammy';
import { waitUntil } from '@vercel/functions';
import { replyFromHistory, MAX_OUTPUT_TOKENS } from '@/packages/ai';
import { delay } from '@ai-sdk/provider-utils';
import { generateSystemPrompt } from '@/packages/prompts';

const token = env.TELEGRAM_BOT_TOKEN;
if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
}

const bot = new Bot(token);

bot.on('message:text', async (ctx) => {
    const interval = await botIsTyping(bot, ctx.chatId.toString());
    console.log(new Date(ctx.message.date * 1000).toISOString(), ctx.chatId, ctx.message.text);
    // TODO: Get message history from a database
    const result = await replyFromHistory([
        {
            role: 'system',
            content: generateSystemPrompt(""),
        },
        {
            role: 'user',
            content: ctx.message.text,
        }
    ], ctx.chatId.toString());

    waitUntil((async () => {
        if (result.usage.outputTokens) {
            await delay(10000 * result.usage.outputTokens / MAX_OUTPUT_TOKENS); // Simulate typing delay based on output tokens
        }
        await botSendMessage(bot, ctx.chatId.toString(), result.text.trim(),
            ctx.message.message_id, interval) // Echo the received message
    })());
});

export const POST = webhookCallback(bot, 'std/http');