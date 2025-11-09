import { groq } from '@ai-sdk/groq';
import { generateText, stepCountIs, type AssistantModelMessage, type GenerateTextResult, type ToolModelMessage, type ToolSet, type UserModelMessage } from 'ai';
import { agent, generateSystemPrompt } from '@/packages/agent';
import { reminders, type User } from '@/server/db/schema';
import { db } from '@/server/db';
import { union } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, not } from 'drizzle-orm';
import { experimental_transcribe as transcribe } from 'ai';
import { embedMany } from 'ai';
import { google } from '@ai-sdk/google';
import { searchMemories } from '../memory';
import { uuidv7 } from 'uuidv7';

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
    const rems = await union( // 1-3-5 rule
        db.select().from(reminders).where(and(
            eq(reminders.userId, user.id),
            not(reminders.sent), not(reminders.deleted),
            eq(reminders.priority, 'high'),
        )).orderBy(asc(reminders.dueAt), desc(reminders.createdAt)).limit(1),
        db.select().from(reminders).where(and(
            eq(reminders.userId, user.id),
            not(reminders.sent), not(reminders.deleted),
            eq(reminders.priority, 'medium'),
        )).orderBy(asc(reminders.dueAt), desc(reminders.createdAt)).limit(3),
        db.select().from(reminders).where(and(
            eq(reminders.userId, user.id),
            not(reminders.sent), not(reminders.deleted),
            eq(reminders.priority, 'low'),
        )).orderBy(asc(reminders.dueAt), desc(reminders.createdAt)).limit(5),
    ).execute()
    // add searchMemories result at the top of conversation history
    messages.unshift({
        role: 'tool',
        content: [
            {
                type: 'tool-result',
                toolCallId: uuidv7(),
                toolName: 'searchMemories',
                output: {
                    type: 'text',
                    value: await searchMemories(messages, user),
                }
            }
        ],
    })
    const result = await agent(user, rems).generate({
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

/**
 * Transcribes audio content to text using the AI model.
 * @param url 
 */
export async function transcribeAudio(url: URL): Promise<string> {
    const transcript = await transcribe({
        model: groq.transcription('whisper-large-v3-turbo'),
        audio: url,
    });
    console.log('lang:', transcript.language, 'Transcription result:', transcript.text);
    return transcript.text;
}

/**
 * Embeds the text array using gemini's embedding model.
 * @param texts
 */
export async function embedInputs(values: string[], dims = 768) {
    const model = google.textEmbeddingModel('gemini-embedding-001')

    return await embedMany({
        model,
        values,
        providerOptions: {
            google: {
                outputDimensionality: dims,
                taskType: 'QUESTION_ANSWERING',
            }
        }
    })
}