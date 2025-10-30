export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { env } from '@/env';
import { botIsTyping, botSendMessage } from '@/packages/telegram';
import { Bot, webhookCallback } from 'grammy';
import { waitUntil } from '@vercel/functions';
import { replyFromHistory, MAX_OUTPUT_TOKENS, transcribeAudio } from '@/packages/ai';
import { delay, type UserModelMessage } from '@ai-sdk/provider-utils';
import { encodingForModel } from 'js-tiktoken';
import { getLatestMessagesForUser, getUserFromIdentifier, saveMessagesForUser } from '@/packages/utils';

const token = env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
const bot = new Bot(token);
const webapp = env.WEBAPP_URL;
if (!webapp) throw new Error('WEBAPP_URL is not set');

bot.command('reminders', async (ctx) => {
    await ctx.reply('View & manage reminders from here', {
        reply_markup: {
            inline_keyboard: [[
                // TODO: secure the link with a JWT or unique token
                { text: "Reminders", url: new URL(`?platform=telegram&chatId=${ctx.chatId}`, webapp).toString() }
            ]]
        }
    });
})

bot.on('message', async (ctx) => {
    const interval = await botIsTyping(bot, ctx.chatId.toString());
    if (ctx.message.voice) {
        const voice = ctx.message.voice;
        console.log(new Date(ctx.message.date * 1000).toISOString(), ctx.chatId, `Voice message of duration ${voice.duration} seconds`, voice.file_id);
        const file = await ctx.getFile()
        if (file.file_path) {
            const text = await transcribeAudio(new URL(file.file_path, `https://api.telegram.org/file/bot${token}/`));
            console.log('Transcribed text:', text);
            ctx.message.text = text;
        }
    }
    if (!ctx.message.text && !ctx.message.photo)
        return await botSendMessage(bot, ctx.chatId.toString(), "⚠️ I currently only support text messages, sorry to keep you waiting!",
            ctx.message.message_id, interval);
    console.log(new Date(ctx.message.date * 1000).toISOString(), ctx.chatId, ctx.message.text ?? ctx.message.caption);

    try {
        // get user session, create if not exists
        const user = await getUserFromIdentifier('telegram', ctx.chatId.toString(), true);
        if (!user) {
            console.log('User not found for chatId', ctx.chatId);
            return;
        }

        const msgs = await getLatestMessagesForUser(user);
        console.log(`${user.platform}-${user.identifier}`, 'Loaded', msgs.length, 'messages from history for user');

        let message: UserModelMessage;
        if (ctx.message.photo) {
            const photo = ctx.message.photo[2] ?? ctx.message.photo[0]; // either get SD or thumbnail (Telegram sends 4 sizes)
            const content: UserModelMessage['content'] = [
                {
                    type: 'text',
                    text: ctx.message.caption ?? 'Describe the image attached.',
                }
            ]
            if (photo) {
                console.log('Photo size:', `${photo.width}x${photo.height}`, 'file_id:', photo.file_id);
                const image = await ctx.api.getFile(photo.file_id)
                if (image.file_path) content.push({
                    type: 'image',
                    image: new URL(`${image.file_path}?fileid=${photo.file_id}`, `https://api.telegram.org/file/bot${token}/`),
                });
            }
            message = { role: 'user', content };
        } else if (ctx.message.text) {
            message = { role: 'user', content: ctx.message.text };
        } else {
            throw new Error('No text or photo found in the message.');
        }

        if (!user.metadata) {
            // assist user onboarding with telegram info
            msgs.push({ role: 'user', content: `Data from telegram to assist onboarding: ${JSON.stringify(ctx.from)}. Do not assume timezone, please ask.` })
        }

        msgs.push(message);
        const result = await replyFromHistory(msgs, user);

        // Save user message and assistant response in a transaction
        const responses = result.response.messages.map((m, i) => ({ ...m, tokenCount: i == result.response.messages.length - 1 ? (result.usage.outputTokens ?? 512) : 0 }))
        await saveMessagesForUser(user, [
            // TODO: use the correct tokenizer based on the model used to get the correct token count
            { role: 'user', content: message.content, tokenCount: ctx.message.text ? encodingForModel('gpt-3.5-turbo').encode(ctx.message.text).length : 512 },
            ...responses, // Don't save system messages
        ])

        waitUntil((async () => {
            if (result.usage.outputTokens) {
                await delay(10000 * result.usage.outputTokens / MAX_OUTPUT_TOKENS); // Simulate typing delay based on output tokens
            }
            if (!result.text.trim()) await botSendMessage(bot, ctx.chatId.toString(), "ℹ️ bot replied with empty text", ctx.message.message_id, interval)
            else await botSendMessage(bot, ctx.chatId.toString(), result.text.trim(), ctx.message.message_id, interval)
        })());
    } catch (e) {
        console.error('Error processing message:', e);
        await botSendMessage(bot, ctx.chatId.toString(), "⚠️ Sorry, something went wrong while processing your message. Please try again later.",
            ctx.message.message_id, interval);
        return;
    }
});

export const POST = webhookCallback(bot, 'std/http');