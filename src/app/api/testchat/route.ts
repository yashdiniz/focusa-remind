import { env } from "@/env";
import { replyFromHistory } from "@/packages/ai";
import { assistantModelMessageSchema, toolModelMessageSchema, userModelMessageSchema } from "ai";
import type { NextRequest } from "next/server";
import z from "zod";

const inputSchema = z.union([userModelMessageSchema, assistantModelMessageSchema, toolModelMessageSchema]).array().min(1);

export async function POST(req: NextRequest) {
    // Simple auth for testing endpoint
    if (req.headers.get("x-api-key") !== env.AUTH_SECRET) {
        return new Response("Unauthorized", { status: 401 });
    }

    // Validate input to match array of messages
    const res = inputSchema.safeParse(await req.json());
    if (!res.success) {
        console.error("Invalid input to /api/testchat:", res.error);
        return new Response(JSON.stringify(res.error.message), {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    try {
        // Call the AI with the message history
        const result = await replyFromHistory(res.data, {
            id: 'test-user-id',
            platform: 'telegram',
            identifier: 'test-identifier',
            createdAt: new Date(),
            updatedAt: null,
            metadata: {
                name: 'Test User',
                language: 'English',
                timezone: 'Asia/Kolkata',
                summary: 'A test user who is learning Chess and Japanese and interested in technology and science.',
            }
        })
        return new Response(JSON.stringify(result.response.messages), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    } catch (e) {
        if (e instanceof Error) {
            return new Response(`Error processing request: ${e.message}`, { status: 500 });
        }
        console.error("Error in /api/testchat:", e);
        return new Response(`Error processing request: unknown`, { status: 500 });
    }
}