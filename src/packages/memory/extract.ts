import type { User } from "@/server/db/schema";
import { groq } from "@ai-sdk/groq"
import { generateObject, type ModelMessage } from "ai";
import z from "zod";

const model = groq("meta-llama/llama-4-scout-17b-16e-instruct"); // groq('gemma2-9b-it');

const preamble = `Extract relevant memories from the conversation that you should remember when speaking with the user later.

Each memory must be an atomic fact of the format <subject><verb><predicate>. Examples:
- User likes coffee
- User is interested in LLMs and AI
- User's friends went home for the holidays

If there is no information worth extracting, set noInfo to true, else false
`

export async function extractMemories(messages: Array<ModelMessage>, user: User) {
    const system = preamble + (
        user.metadata ?
            `Today is ${new Date().toLocaleString('en-IN', { timeZone: user.metadata.timezone ?? 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} ${new Date().toLocaleString('en-IN', { timeZone: user.metadata.timezone ?? 'UTC', hour12: false, hour: 'numeric', minute: 'numeric' })} at user's local timezone`
            : ''
    );

    const { usage, object } = await generateObject({
        model, system,
        messages,
        schema: z.object({
            noInfo: z.boolean().describe('set true if no info to be extracted'),
            info: z.array(z.string()).describe('list of memories').optional(),
        }),
        providerOptions: {
            groq: {
                user: `${user.platform}-${user.identifier}`, // Unique identifier for the user (optional)
            },
        },
    })
    console.log('extractMemories Usage:', usage)
    return object
}