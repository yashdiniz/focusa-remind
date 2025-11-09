import { db } from "@/server/db";
import { memories, type User } from "@/server/db/schema";
import { google } from "@ai-sdk/google";
import { encode } from "@toon-format/toon";
import { generateObject, type AssistantModelMessage, type ToolModelMessage, type UserModelMessage } from "ai";
import { and, cosineDistance, desc, eq, sql } from "drizzle-orm";
import z from "zod";
import { embedInputs } from "../ai";

const model = google('gemini-2.0-flash-lite')

const system = `Generate relevant search query based on conversation provided.
Search query must be formatted as a web search query, and is used to search the database for memories.
If no search needs to be performed, set noSearch to true, else false`

export async function searchMemories(messages: (UserModelMessage | AssistantModelMessage | ToolModelMessage)[], user: User) {
    const res = await generateObject({
        model, system,
        messages,
        schema: z.object({
            noSearch: z.boolean().describe('set true if no search is needed'),
            query: z.string().describe('search query, formatted as a web search query').optional(),
        }),
    })
    console.log('searchMemories query', res.usage)
    const { noSearch, query } = res.object

    if (noSearch || !query) {
        console.log('searchMemories', 'no search required')
        return ''
    }

    const embs = await embedInputs([query])
    if (!embs.embeddings[0] || embs.embeddings.length == 0) {
        console.error('searchMemories', 'failed to generate embeddings')
        return ''
    }

    const similarity = sql<number>`1 - (${cosineDistance(memories.embedding, embs.embeddings[0])})`;

    // NOTE: only required for ivfflat
    // await db.execute(sql`SET ivfflat.probes = 10`)

    const result = await db
        .select({ id: memories.id, fact: memories.fact, similarity })
        .from(memories)
        .where(and(
            eq(memories.userId, user.id),
            eq(memories.deleted, false),
        ))
        .orderBy(t => [desc(t.similarity), desc(memories.createdAt)])
        .limit(10)
        .execute()
    if (!result[0] || result.length == 0) {
        console.error('searchMemories', 'failed to query memories (returned empty result)')
        return ''
    }

    return encode(result)
}