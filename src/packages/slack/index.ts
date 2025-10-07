import type { ChatPostMessageResponse, WebClient } from "@slack/web-api";

export async function botSendMessage(bot: WebClient, channel: string, markdown_text: string): Promise<ChatPostMessageResponse> {
    return await bot.chat.postMessage({ channel, markdown_text })
}