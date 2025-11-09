import { db } from "@/server/db";
import { memories, type User } from "@/server/db/schema";
import { encode } from "@toon-format/toon";
import { and, cosineDistance, desc, eq, sql } from "drizzle-orm";
import { embedInputs } from "../ai";

// const system = `Generate relevant search query based on conversation provided.
// Search query must be formatted as a web search query, and is used to search the database for memories.
// If no search needs to be performed, set noSearch to true, else false`

export async function searchMemories(lastMessage: string, user: User) {
    const query = lastMessage

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