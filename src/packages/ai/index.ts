import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';

/**
 * Generates a response from the AI model.
 * @param userInput Message input from the user.
 * @param chatId Optional chat ID for user identification.
 * @returns Response text from the AI model.
 */
export async function generateResponse(userInput: string, chatId?: string): Promise<string> {
    const result = await generateText({
        model: groq('gemma2-9b-it'),
        providerOptions: {
            groq: {
                // reasoningFormat: 'parsed',
                // reasoningEffort: 'default',
                // serviceTier: 'on_demand', // Use flex tier for higher throughput (optional)
                // parallelToolCalls: true, // Enable parallel function calling (default: true)
                user: chatId ?? 'noChatIdProvided', // Unique identifier for the user (optional)
            },
        },
        prompt: [
            {
                role: 'system',
                content: 'You are a helpful assistant.',
            },
            {
                role: 'user',
                content: userInput,
            }
        ]
    });
    console.log('AI response:', result);
    return result.text;
}
