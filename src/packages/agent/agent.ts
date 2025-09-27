import { groq } from "@ai-sdk/groq";
import { Experimental_Agent as Agent, stepCountIs, type StopCondition, type ToolSet } from "ai";
import { FIRST_INTERACTION_PROMPT, generateSystemPrompt } from "./prompt";
import { tools } from "@/packages/tools";
import type { User } from "@/server/db/schema";

const MAX_OUTPUT_TOKENS = 1024;
const model = groq("meta-llama/llama-4-scout-17b-16e-instruct"); // groq('gemma2-9b-it');

const budgetExceeded: (budget?: number) => StopCondition<ToolSet> = (budget = 2000) => ({ steps }) => {
    const totalUsage = steps.reduce(
        (acc, step) => ({
            tokens: acc.tokens + (step.usage?.totalTokens ?? 0),
        }),
        { tokens: 0 },
    );

    const costEstimate = totalUsage.tokens;
    return costEstimate > budget; // Stop if total tokens exceeded
};

export function agent(user: User): Agent<ToolSet, string> {
    const system = user.metadata ? generateSystemPrompt([
        `[[username: ${user.metadata.name ?? 'unknown'}]] [[language: ${user.metadata.language ?? 'English'}]] [[timezone: ${user.metadata.timezone ?? 'UTC'}]] [[summary: ${user.metadata.summary}]]`,
        `Today is ${new Date().toLocaleString('en-IN', { timeZone: user.metadata.timezone ?? 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. It's ${new Date().toLocaleString('en-IN', { timeZone: user.metadata.timezone ?? 'UTC', hour12: true, hour: 'numeric', minute: 'numeric' })} at user's local timezone`,
    ]) : generateSystemPrompt([FIRST_INTERACTION_PROMPT]);
    const agent = new Agent({
        model, maxOutputTokens: MAX_OUTPUT_TOKENS,
        system,
        stopWhen: [
            stepCountIs(5), // Stop after 5 steps
            budgetExceeded(3000),
        ],
        tools: tools(user),
    })

    return agent;
}