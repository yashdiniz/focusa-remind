import z from "zod";
import { db } from "@/server/db";
import { memories, type User } from "@/server/db/schema";
import { encode } from "@toon-format/toon";
import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { embedInputs } from "../ai";
import { and, eq, inArray } from "drizzle-orm";
import { groq } from "@ai-sdk/groq";

const MAX_OUTPUT_TOKENS = 8192
const model = groq('meta-llama/llama-4-scout-17b-16e-instruct')

const preamble = (metadata: User["metadata"]) => `Extract relevant memories from conversation and decide how to combine the new memories with the given existing similar memories from the database
# CONTEXT
You have access to memories, relevant timestamped information, and a conversation 
# Instructions
- add new memories to the database
- if you want to add newer/richer information and you find similar memories, update the existing memories instead (replace for newer info, extend for richer info)
- if memories contain contradictory information, prioritize the most recent memory, and delete the older memory if there's no information to replace or extend

Each memory must be a unique atomic piece of information, and is classified into one of these categories:
- fact: user preferences, account details, and domain facts
- episode: summaries of past interactions or completed tasks
- semantic: relationships between concepts for better reasoning

Some additional info
username: ${metadata?.name ?? 'unknown'}, language: ${metadata?.language ?? 'English'}, timezone: ${metadata?.timezone ?? 'UTC'}
Today is ${new Date().toLocaleString('en-IN', { timeZone: metadata?.timezone ?? 'UTC', hour12: false, hour: 'numeric', minute: 'numeric' })} on ${new Date().toLocaleString('en-IN', { timeZone: metadata?.timezone ?? 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at user's local timezone

Reply strictly with summary of your actions (10 words or less), else only reply with 'acked' and nothing else

summary:`

export function updateMemoryAgent(user: User) {
    const addMemory = tool({
        name: 'add',
        description: 'add a new memories into the database',
        inputSchema: z.object({
            category: z.enum(['fact', 'episode', 'semantic']).describe('classification of new memory'),
            content: z.string().describe('new memory'),
        }),
        async execute(input) {
            console.log('updateMemoryAgent add', input)
            const embs = await embedInputs([input.content])
            if (!embs.embeddings[0]) return encode({
                success: false, error: 'failed to generate embeddings',
            })

            const memory = await db.insert(memories).values({
                userId: user.id, fact: input.content, metadata: { categories: [input.category] }, embedding: embs.embeddings[0],
            }).returning().execute()
            if (!memory[0] || memory.length === 0) return encode({
                success: false, error: 'failed to add new memory',
            })

            return encode({ success: true, id: memory[0].id, memory: input.content })
        }
    })

    const updateMemory = tool({
        name: 'update',
        description: 'update existing memory with richer information',
        inputSchema: z.object({
            memoryId: z.uuidv7().describe('id of the memory to update'),
            content: z.string().describe('new memory to update the old memory'),
            type: z.enum(['replace', 'extend']).describe('type of update operation'),
            category: z.enum(['fact', 'episode', 'semantic']).describe('classification of new memory'),
        }),
        async execute(input) {
            console.log('updateMemoryAgent update', input)

            try {
                const embs = await embedInputs([input.content])

                return await db.transaction(async tx => {
                    if (!embs.embeddings[0] || embs.embeddings.length === 0) throw new Error('failed to generate embeddings')

                    const oldMemory = await tx.update(memories).set({
                        deleted: true, // TODO: right now parent node is deleted to filter it out
                    }).where(and(
                        eq(memories.userId, user.id),
                        eq(memories.id, input.memoryId),
                    )).returning().execute()
                    if (!oldMemory[0] || oldMemory.length === 0) throw new Error('failed to update parent memory')

                    const memory = await tx.insert(memories).values({
                        userId: user.id, fact: input.content, embedding: embs.embeddings[0],
                        metadata: { categories: [input.category] }, parentId: oldMemory[0].id, edgeType: input.type,
                    }).returning().execute()
                    if (!memory[0] || memory.length === 0) throw new Error('failed to insert child memory')

                    return encode({ success: true, newId: memory[0].id, memory: input.content })
                })
            } catch (e) {
                if (e instanceof Error) return encode({
                    success: false, error: e.message,
                })
            }
        }
    })

    const deleteMemory = tool({
        name: 'delete',
        description: 'remove existing memories from the database',
        inputSchema: z.array(z.uuidv7()).describe('list of memory ids to remove'),
        async execute(input) {
            console.log('updateMemoryAgent delete', input)
            const memory = await db.update(memories).set({ deleted: true })
                .where(and(eq(memories.userId, user.id), inArray(memories.id, input)))
                .returning().execute()
            if (!memory[0] || memory.length === 0) return encode({
                success: false, error: 'failed to delete memories'
            })

            return encode({ success: true, deleted: memory.map(v => ({ id: v.id, fact: v.fact })) })
        }
    })

    return new Agent({
        model, system: preamble(user.metadata),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        stopWhen: [
            stepCountIs(5),
        ],
        tools: {
            'memory.add': addMemory,
            'memory.update': updateMemory,
            'memory.delete': deleteMemory,
        },
    })
}