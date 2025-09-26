export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { env } from '@/env';
import { botIsTyping, botSendMessage } from '@/packages/telegram';
import { Bot, webhookCallback } from 'grammy';
import { waitUntil } from '@vercel/functions';
import { replyFromHistory, MAX_OUTPUT_TOKENS } from '@/packages/ai';
import { delay } from '@ai-sdk/provider-utils';
import { encodingForModel } from 'js-tiktoken';
import { getLatestMessagesForUser, getUserFromIdentifier, saveMessagesForUser } from '@/packages/utils';

const token = env.TELEGRAM_BOT_TOKEN;
if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
}

const bot = new Bot(token);

bot.on('message:text', async (ctx) => {
    const interval = await botIsTyping(bot, ctx.chatId.toString());
    console.log(new Date(ctx.message.date * 1000).toISOString(), ctx.chatId, ctx.message.text);

    try {
        // get user session, create if not exists
        const user = await getUserFromIdentifier('telegram', ctx.chatId.toString(), true);
        if (!user) {
            console.log('User not found for chatId', ctx.chatId);
            return;
        }

        const msgs = await getLatestMessagesForUser(user);
        console.log(`${user.platform}-${user.identifier}`, 'Loaded', msgs.length, 'messages from history for user');

        if (!user.metadata) {
            // assist user onboarding with telegram info
            msgs.push({ role: 'user', content: `Data from telegram to assist onboarding: ${JSON.stringify(ctx.from)}. Do not assume timezone, please ask.` })
        }
        msgs.push({ role: 'user', content: ctx.message.text })

        const result = await replyFromHistory(msgs, user);

        // Save user message and assistant response in a transaction
        const responses = result.response.messages.map((m, i) => ({ ...m, tokenCount: i == result.response.messages.length - 1 ? (result.usage.outputTokens ?? 512) : 0 }))
        await saveMessagesForUser(user, [
            // TODO: use the correct tokenizer based on the model used to get the correct token count
            { role: 'user', content: ctx.message.text, tokenCount: encodingForModel('gpt-3.5-turbo').encode(ctx.message.text).length },
            ...responses, // Don't save system messages
        ])

        waitUntil((async () => {
            if (result.usage.outputTokens) {
                await delay(10000 * result.usage.outputTokens / MAX_OUTPUT_TOKENS); // Simulate typing delay based on output tokens
            }
            await botSendMessage(bot, ctx.chatId.toString(), result.text.trim(), ctx.message.message_id, interval) // Echo the received message
        })());
    } catch (e) {
        console.error('Error processing message:', e);
        await botSendMessage(bot, ctx.chatId.toString(), "Sorry, something went wrong while processing your message. Please try again later.",
            ctx.message.message_id, interval);
        return;
    }
});

export const POST = webhookCallback(bot, 'std/http');