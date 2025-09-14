import { groq } from '@ai-sdk/groq';
import { delay } from '@ai-sdk/provider-utils';
import { generateText, type ModelMessage } from 'ai';
import { tools } from '../tools';

export const SYSTEM_PROMPT = `You are a helpful assistant. Call tools only when necessary. Answer in plain text, no markdown.`;
const MAX_OUTPUT_TOKENS = 1024;
const model = groq("meta-llama/llama-4-scout-17b-16e-instruct"); // groq('gemma2-9b-it');

/**
 * Generate a response from the AI model.
 * @param prompt Prompt string to generate a response for.
 * @param system (Optional) System prompt to guide the AI's behavior.
 * @param chatId (Optional) Chat ID for user identification.
 * @returns Response text from the AI model.
 */
export async function generateResponse(prompt: string, system?: string, chatId?: string): Promise<string> {
    const { text } = await generateText({
        model, maxOutputTokens: MAX_OUTPUT_TOKENS,
        providerOptions: {
            groq: {
                reasoningFormat: 'parsed',
                reasoningEffort: 'default',
                // serviceTier: 'on_demand', // Use flex tier for higher throughput (optional)
                // parallelToolCalls: true, // Enable parallel function calling (default: true)
                user: chatId ?? 'noChatIdProvided', // Unique identifier for the user (optional)
            },
        },
        system: system ?? SYSTEM_PROMPT,
        prompt,
    });
    console.log('AI response:', text);
    return text;
}

/**
 * Generates a response from the provided messages.
 * @param messages Message input from the user.
 * @param chatId Optional chat ID for user identification.
 * @returns Response text from the AI model.
 */
export async function replyFromHistory(messages: ModelMessage[], chatId?: string): Promise<string> {
    // TODO: add reAct tool calling
    const { usage, text, content } = await generateText({
        model, maxOutputTokens: MAX_OUTPUT_TOKENS,
        providerOptions: {
            groq: {
                user: chatId ?? 'noChatIdProvided', // Unique identifier for the user (optional)
            },
        },
        tools,
        messages,
    });
    if (usage.outputTokens) {
        await delay(5000 * usage.outputTokens / MAX_OUTPUT_TOKENS); // Simulate typing delay based on output tokens
    }
    console.log(usage, 'AI response:', text, JSON.stringify(content));
    return text;
}
