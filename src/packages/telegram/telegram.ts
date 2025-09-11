import type { Bot } from "grammy";
import type { Message } from "grammy/types";

/**
 * Simulates the bot typing action in a Telegram chat.
 * REMEMBER TO CLEAR THE INTERVAL AFTER USE TO STOP THE TYPING ACTION.
 * @param bot grammy bot instance
 * @param chatId chat ID to send the typing action to
 * @returns interval ID to clear later
 */
export async function botIsTyping(bot: Bot, chatId: string): Promise<NodeJS.Timeout> {
    await bot.api.sendChatAction(chatId, 'typing');
    const interval = setInterval(() => {
        bot.api.sendChatAction(chatId, 'typing').catch(console.error);
    }, 5000)
    return interval;
}

/**
 * Sends a message to a Telegram chat and optionally clears a typing interval.
 * @param bot grammy bot instance
 * @param chatId chat ID to send the message to
 * @param text text to send
 * @param messageId optional message ID to reply to
 * @param interval optional interval ID to clear after sending the message
 * @returns the sent message
 */
export async function botSendMessage(bot: Bot, chatId: string, text: string,
    messageId?: number, interval?: NodeJS.Timeout): Promise<Message.TextMessage> {
    const message = await bot.api.sendMessage(chatId, text,
        {
            reply_parameters: messageId ? { message_id: messageId } : undefined,
            parse_mode: 'MarkdownV2',
        }
    );
    if (interval) {
        clearInterval(interval);
    }
    return message;
}