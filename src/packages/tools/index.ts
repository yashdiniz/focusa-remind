import { z } from "zod";
import { evaluate } from "mathjs";
import { tool } from "ai";

export function getTools(toString?: boolean): Record<string, string> | string {
    const toolSet: Record<string, string> = {};
    for (const [key, value] of Object.entries(tools)) toolSet[key] = value.description ?? "No description available";
    if (toString) {
        return `Available tools:\n\n ${Object.entries(toolSet).map(([key, value]) => `- ${key}: ${value}`).join("\n")}`;
    }
    return toolSet;
}

const eval_math_expression = tool({
    name: "eval_math_expression",
    description: 'A tool for evaluating mathematical expressions. Example expressions: ' + "'1.2 * (2 + 4.5)', '12.7 cm to inch', 'sin(45 deg) ^ 2'.",
    inputSchema: z.object({ expression: z.string() }),
    execute: async ({ expression }) => {
        try {
            const result = evaluate(expression) as { toString(): string };
            if (typeof result.toString === "function") {
                return {
                    content: [{ type: "text", text: result.toString() }],
                };
            }
            throw new Error("invalid result from mathjs evaluate");
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
            };
        }
    }
});

export const tools = { eval_math_expression };