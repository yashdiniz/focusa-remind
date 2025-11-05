import { env } from "@/env";
import type { NextRequest } from "next/server";
import z from "zod";
import { cosineSimilarity } from "ai";
import { embedInputs } from "@/packages/ai";

const inputSchema = z.array(z.string()).min(1)

export async function POST(req: NextRequest) {
    // Simple auth for testing endpoint
    if (req.headers.get('x-api-key') !== env.AUTH_SECRET) return new Response("Unauthorized", { status: 401 })

    // Validate input to match array of messages
    const res = inputSchema.safeParse(await req.json());
    if (!res.success) {
        console.error("Invalid input to /api/embed:", res.error);
        return new Response(res.error.message, {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const { embeddings, usage, values } = await embedInputs(res.data)

    console.log('tokens:', usage.tokens)
    for (let i = 0; i < embeddings.length; i++) {
        console.log(i, values[i])
        const sims = []
        for (let j = 0; j < values.length; j++) {
            sims.push(cosineSimilarity(embeddings[i]!, embeddings[j]!).toPrecision(2))
        }
        console.log(`\tEmbedding<${embeddings[i]?.length}>\t`, sims)
    }

    const result: Record<string, number[]> = {}
    for (let i = 0; i < values.length; i++) result[values[i] ?? ''] = embeddings[i] as number[];

    return new Response(JSON.stringify(result), {
        headers: {
            'Content-Type': 'application/json',
        }
    })
}