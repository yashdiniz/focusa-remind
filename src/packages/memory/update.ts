import z from "zod";
import { db } from "@/server/db";
import { memories, type User } from "@/server/db/schema";
import { encode } from "@toon-format/toon";
import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { embedInputs } from "../ai";
import { and, eq, inArray } from "drizzle-orm";
import { groq } from "@ai-sdk/groq";

const model = groq('meta-llama/llama-4-maverick-17b-128e-instruct')

const preamble = `Extract relevant memories from the given conversation between user and assistant and decide how to combine the new memories with the given existing similar memories from the database.

Each memory must be an atomic fact of the format <subject><verb><predicate>. Examples:
- User likes coffee
- User is interested in LLMs and AI
- User's friends went home for the holidays

A memory is classified into one of these categories:
- fact: user preferences, account details, and domain facts
- episode: summaries of past interactions or completed tasks
- semantic: relationships between concepts for better reasoning

If no actions required and no relevant information, finish with 'acknowledged' and nothing else.

Strictly reply with a summary of your actions (less than 10 words)
`

export function updateMemoryAgent(user: User) {
    const addMemory = tool({
        name: 'add',
        description: 'add a new memories into the database',
        inputSchema: z.object({
            category: z.enum(['fact', 'episode', 'semantic']),
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
            if (!memory[0] || memory.length == 0) return encode({
                success: false, error: 'failed to add new memory',
            })

            return encode({ success: true, id: memory[0].id })
        }
    })

    const updateMemory = tool({
        name: 'update',
        description: 'update existing memory with richer information',
        inputSchema: z.object({
            memoryId: z.uuidv7().describe('id of the memory to update'),
            memory: z.string().describe('new memory to update the old memory'),
            type: z.enum(['replace', 'extend']).describe('type of update operation'),
        }),
        async execute(input) {
            console.log('updateMemoryAgent update', input)

            try {
                const embs = await embedInputs([input.memory])

                return await db.transaction(async tx => {
                    if (!embs.embeddings[0] || embs.embeddings.length == 0) throw new Error('failed to generate embeddings')

                    const oldMemory = await tx.update(memories).set({
                        deleted: true, // TODO: right now parent node is deleted to filter it out
                    }).where(and(
                        eq(memories.userId, user.id),
                        eq(memories.id, input.memoryId),
                    )).returning().execute()
                    if (!oldMemory[0] || oldMemory.length == 0) throw new Error('failed to update parent memory')

                    const memory = await tx.insert(memories).values({
                        userId: user.id, fact: input.memory, embedding: embs.embeddings[0],
                        metadata: oldMemory[0].metadata, parentId: oldMemory[0].id, edgeType: input.type,
                    }).returning().execute()
                    if (!memory[0] || memory.length == 0) throw new Error('failed to insert child memory')

                    return encode({ success: true, newId: memory[0].id })
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
            if (!memory[0] || memory.length == 0) return encode({
                success: false, error: 'failed to delete memories'
            })

            return encode({ success: true, deleted: input })
        }
    })

    const system = preamble + (user.metadata ?
        `Some additional info\nusername: ${user.metadata.name ?? 'unknown'}, language: ${user.metadata.language ?? 'English'}, timezone: ${user.metadata.timezone ?? 'UTC'}. Today is ${new Date().toLocaleString('en-IN', { timeZone: user.metadata.timezone ?? 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. It's ${new Date().toLocaleString('en-IN', { timeZone: user.metadata.timezone ?? 'UTC', hour12: false, hour: 'numeric', minute: 'numeric' })} at user's local timezone\n`
        : '') + '\nSUMMARY:'

    return new Agent({
        model, system,
        stopWhen: [
            stepCountIs(5),
        ],
        tools: {
            add: addMemory,
            update: updateMemory,
            delete: deleteMemory,
        },
    })
}