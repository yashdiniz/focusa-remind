import { groq } from '@ai-sdk/groq';
import { delay } from '@ai-sdk/provider-utils';
import { generateText, type ModelMessage } from 'ai';

export const SYSTEM_PROMPT = `You are a helpful assistant.`
const MAX_OUTPUT_TOKENS = 1024;

/**
 * Generates a response from the AI model.
 * @param userInput Message input from the user.
 * @param chatId Optional chat ID for user identification.
 * @returns Response text from the AI model.
 */
export async function generateResponse(prompt: ModelMessage[], chatId?: string): Promise<string> {
    const result = await generateText({
        model: groq('gemma2-9b-it'),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        providerOptions: {
            groq: {
                // reasoningFormat: 'parsed',
                // reasoningEffort: 'default',
                // serviceTier: 'on_demand', // Use flex tier for higher throughput (optional)
                // parallelToolCalls: true, // Enable parallel function calling (default: true)
                user: chatId ?? 'noChatIdProvided', // Unique identifier for the user (optional)
            },
        },
        prompt,
    });
    if (result.usage.outputTokens) {
        await delay(5000 * result.usage.outputTokens / MAX_OUTPUT_TOKENS); // Simulate typing delay based on output tokens
    }
    return result.text;
}
