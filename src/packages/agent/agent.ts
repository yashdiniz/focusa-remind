import { groq } from "@ai-sdk/groq";
import { Experimental_Agent as Agent, stepCountIs, type StopCondition, type ToolSet } from "ai";
import { FIRST_INTERACTION_PROMPT, generateSystemPrompt } from "./prompt";
import { tools } from "@/packages/tools";
import type { User } from "@/server/db/schema";

const MAX_OUTPUT_TOKENS = 1024;
const model = groq("meta-llama/llama-4-scout-17b-16e-instruct"); // groq('gemma2-9b-it');

const budgetExceeded: StopCondition<ToolSet> = ({ steps }) => {
    const totalUsage = steps.reduce(
        (acc, step) => ({
            inputTokens: acc.inputTokens + (step.usage?.inputTokens ?? 0),
            outputTokens: acc.outputTokens + (step.usage?.outputTokens ?? 0),
        }),
        { inputTokens: 0, outputTokens: 0 },
    );

    const costEstimate =
        (totalUsage.inputTokens * 0.01 + totalUsage.outputTokens * 0.03) / 1000;
    return costEstimate > 0.5; // Stop if cost exceeds $0.5
};

export function agent(user: User): Agent<ToolSet, string> {
    const system = user.metadata ? generateSystemPrompt([
        user.metadata.summary,
        `The time right now is ${new Date().toLocaleString('en-IN', { timeZone: user.metadata.timezone ?? 'UTC', hour12: true, hour: 'numeric', minute: 'numeric', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.
The user prefers to communicate in ${user.metadata.language ?? 'English'}.
The user's name is ${user.metadata.name ?? 'Unknown'}.
The user's current local time zone is ${user.metadata.timezone ?? 'UTC'}.`,
    ]) : generateSystemPrompt([FIRST_INTERACTION_PROMPT]);
    const agent = new Agent({
        model, maxOutputTokens: MAX_OUTPUT_TOKENS,
        system,
        stopWhen: [
            stepCountIs(5), // Stop after 5 steps
            budgetExceeded,
        ],
        tools: tools(user),
    })

    return agent;
}