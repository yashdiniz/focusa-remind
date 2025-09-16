import { env } from "@/env";
import { replyFromHistory } from "@/packages/ai";
import { generateSystemPrompt } from "@/packages/prompts";
import { modelMessageSchema } from "ai";
import type { NextRequest } from "next/server";

const inputSchema = modelMessageSchema.array().min(1);

export async function POST(req: NextRequest) {
    // Simple auth for testing endpoint
    if (req.headers.get("x-api-key") !== env.AUTH_SECRET) {
        return new Response("Unauthorized", { status: 401 });
    }

    // Validate input to match array of messages
    const res = inputSchema.safeParse(await req.json());
    if (!res.success) {
        return new Response(JSON.stringify(res.error), {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    // Call the AI with the message history
    const result = await replyFromHistory([
        {
            role: "system",
            content: generateSystemPrompt(""),
        },
        ...res.data,
    ], "testChat")
    return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}