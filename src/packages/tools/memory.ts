import { db } from "@/server/db";
import { and, eq, sql } from "drizzle-orm";
import { memories, type User } from "@/server/db/schema";
import { z } from "zod";
import { tool } from "ai";
import { encode } from "@toon-format/toon";
import { searchMemories, updateMemoryAgent } from "../memory";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { uuidv7 } from "uuidv7";
dayjs.extend(utc)
dayjs.extend(timezone)

const search = (user: User) => tool({
    description: "Search (recall) memories/details/information about the user or other facts or entities. Run when explicitly asked or when context about user's past choices would be helpful",
    inputSchema: z.object({
        informationToGet: z.string().describe("Terms to search for in the user's memories in web search query format"),
    }),
    async execute({ informationToGet: q }) {
        console.log('memory search tool called with query:', q)
        try {
            const ts_result = await db
                .select({ fact: memories.fact, similarity: sql<number>`1`, ts: memories.createdAt })
                .from(memories)
                .where(and(
                    eq(memories.userId, user.id),
                    sql`to_tsvector('english', ${memories.fact}) @@ websearch_to_tsquery('english', ${q})`
                )).execute()

            const res = ts_result.map(v => ({
                fact: v.fact, similarity: v.similarity,
                timestamp: dayjs(v.ts).tz(user.metadata?.timezone ?? 'UTC').format('h:mm a [on] D MMM YYYY'),
            }))
            if (ts_result.length < 10) res.push(...(await searchMemories(q, user, true, 10 - ts_result.length)))

            return encode({
                success: true,
                results: res,
            })
        } catch (error) {
            console.log('Error in memory search tool:', error)
            return encode({
                success: false,
                error: error instanceof Error ? error.message : ("Unknown error" + JSON.stringify(error)),
            })
        }
    },
})

const add = (user: User) => tool({
    description: "Add (remember) memories/details/information about the user or other facts or entities. Run when explicitly asked or when the user mentions any information generalizable beyond the context of the current conversation",
    inputSchema: z.object({
        memory: z
            .string()
            .describe("A single sentence or a short paragraph summary of the memories to add"),
    }),
    execute: async ({ memory }) => {
        console.log('memory add tool called with memory:', memory)
        const res = await updateMemoryAgent(user).generate({
            messages: [
                {
                    role: 'tool',
                    content: [{
                        type: 'tool-result',
                        toolCallId: uuidv7(),
                        toolName: 'searchMemories',
                        output: {
                            type: 'text',
                            value: encode(await searchMemories(memory, user, false)), // do not skip ids here
                        }
                    }],
                },
                {
                    role: 'user',
                    content: memory,
                }
            ],
            providerOptions: {
                groq: {
                    user: `${user.platform}-${user.identifier}`, // Unique identifier for the user (optional)
                }
            }
        })
        console.log('memory add tool result:', res.text, res.toolCalls, res.toolResults)
        return encode({ success: true, result: res.toolResults, content: res.text })
    },
})

export function memoryTools(user: User) {
    return {
        ...(user.metadata ? {
            searchMemories: search(user),
            addMemories: add(user),
        } : undefined),
    }
}