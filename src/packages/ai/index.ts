import { groq } from '@ai-sdk/groq';
import { generateText, type GenerateTextResult, type ModelMessage } from 'ai';
import { tools } from '@/packages/tools';
import { generateSystemPrompt } from '@/packages/prompts';

export const MAX_OUTPUT_TOKENS = 1024;
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
                // reasoningFormat: 'parsed',
                // reasoningEffort: 'default',
                // serviceTier: 'on_demand', // Use flex tier for higher throughput (optional)
                // parallelToolCalls: true, // Enable parallel function calling (default: true)
                user: chatId ?? 'noChatIdProvided', // Unique identifier for the user (optional)
            },
        },
        system: system ?? generateSystemPrompt(""),
        prompt,
    });
    console.log('AI response:', text);
    return text;
}

type TOOLS = typeof tools;
/**
 * Generates a response from the provided messages.
 * @param messages Message input from the user.
 * @param chatId Optional chat ID for user identification.
 * @returns Response text from the AI model.
 */
export async function replyFromHistory(messages: ModelMessage[], chatId?: string): Promise<GenerateTextResult<TOOLS, string>> {
    // TODO: add reAct tool calling
    const result = await generateText({
        model, maxOutputTokens: MAX_OUTPUT_TOKENS,
        providerOptions: {
            groq: {
                user: chatId ?? 'noChatIdProvided', // Unique identifier for the user (optional)
            },
        },
        tools,
        messages,
    });
    console.log(result.usage, 'AI response:', result.text);
    console.log('AI content:', JSON.stringify(result.content));
    return result;
}
