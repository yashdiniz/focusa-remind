import { groq } from '@ai-sdk/groq';
import { generateText, stepCountIs, type AssistantModelMessage, type GenerateTextResult, type ToolModelMessage, type ToolSet, type UserModelMessage } from 'ai';
import { agent, generateSystemPrompt } from '@/packages/agent';
import type { User } from '@/server/db/schema';
import { db } from '@/server/db';

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
        stopWhen: stepCountIs(3), // Stop after 3 steps (tool call + tool response + final text)
        system: system ?? generateSystemPrompt(),
        prompt,
    });
    console.log('AI response:', text);
    return text;
}

/**
 * Generates a response from the provided messages.
 * @param messages Message input from the user.
 * @param user User object for context.
 * @returns Response text from the AI model.
 */
export async function replyFromHistory(messages: (UserModelMessage | AssistantModelMessage | ToolModelMessage)[], user: User): Promise<GenerateTextResult<ToolSet, string>> {
    const reminders = await db.query.reminders.findMany({
        where: (reminders, { eq, not, and }) => and(
            eq(reminders.userId, user.id), not(reminders.sent), not(reminders.deleted),
        ),
        orderBy: (reminders, { desc }) => [desc(reminders.dueAt), desc(reminders.createdAt)],
        limit: 5,
    }).execute()
    const result = await agent(user, reminders).generate({
        providerOptions: {
            groq: {
                user: `${user.platform}-${user.identifier}`, // Unique identifier for the user (optional)
            },
        },
        messages,
    });
    console.log(result.usage, 'AI response:', result.text);
    console.log('AI content:', JSON.stringify(result.response.messages));
    return result;
}