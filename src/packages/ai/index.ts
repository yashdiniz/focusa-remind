import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';

export async function generateResponse(chatId: string, userInput: string): Promise<string> {
    const result = await generateText({
        model: groq('gemma2-9b-it'),
        providerOptions: {
            groq: {
                reasoningFormat: 'parsed',
                reasoningEffort: 'default',
                parallelToolCalls: true, // Enable parallel function calling (default: true)
                user: chatId, // Unique identifier for end-user (optional)
                serviceTier: 'flex', // Use flex tier for higher throughput (optional)
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
