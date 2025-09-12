/**
 * NOTE: Currently abandoning this approach, going for the basic tool approach by AI SDK.
 */
import { createMcpHandler } from "mcp-handler";
import type { NextRequest } from "next/server";
import { evaluate } from "mathjs";
import { z } from "zod";
import { env } from "@/env";

const handler = async (
    req: NextRequest,
) => {
    if (req.headers.get("x-api-key") !== env.AUTH_SECRET) {
        return new Response("Missing API key", { status: 401 });
    }
    return createMcpHandler(
        (server) => {
            server.tool(
                "math_eval_expression",
                'A tool for evaluating mathematical expressions. Example expressions: ' + "'1.2 * (2 + 4.5)', '12.7 cm to inch', 'sin(45 deg) ^ 2'.",
                { expr: z.string().min(1, "Expression is required") },
                async ({ expr }) => {
                    try {
                        return {
                            content: [{ type: "text", text: evaluate(expr).toString() }],
                        };
                    } catch (e: Error | any) {
                        return {
                            content: [{ type: "text", text: `Error: ${e.message}` }],
                        };
                    }
                }
            );
        },
        {
            capabilities: {
                tools: {
                    math_eval_expression: {
                        description: "Evaluate a math expression using Math.js",
                    },
                },
            },
        },
        // {
        //     redisUrl: process.env.REDIS_URL,
        //     basePath: `/dynamic/${p}`,
        //     verboseLogs: true,
        //     maxDuration: 60,
        // }
    )(req);
};
export { handler as GET, handler as POST, handler as DELETE };