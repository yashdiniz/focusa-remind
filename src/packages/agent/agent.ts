import { groq } from "@ai-sdk/groq";
import { Experimental_Agent as Agent, stepCountIs, type StopCondition, type ToolSet } from "ai";
import { FIRST_INTERACTION_PROMPT, generateSystemPrompt } from "./prompt";
import { tools } from "@/packages/tools";
import type { ReminderSelect, User } from "@/server/db/schema";
import { humanTime } from "../utils";
import { rrulestr } from "rrule";

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

export function agent(user: User, reminders: ReminderSelect[]): Agent<ToolSet, string> {
    const preamble = user.platform === 'telegram' ?
        `### System\nYou are FOCUSA, a personal assistant and accountability buddy.`
        : `### System\nYou are Blue Remind, a personal assistant and friendly accountability buddy.`
        + ' ' + 'You provide reminders, and help the user achieve their goals.';
    const system = preamble + '\n' + (user.metadata ? generateSystemPrompt([
        `[[username: ${user.metadata.name ?? 'unknown'}]] [[language: ${user.metadata.language ?? 'English'}]] [[timezone: ${user.metadata.timezone ?? 'UTC'}]] [[summary: ${user.metadata.summary}]]`,
        `Today is ${new Date().toLocaleString('en-IN', { timeZone: user.metadata.timezone ?? 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. It's ${new Date().toLocaleString('en-IN', { timeZone: user.metadata.timezone ?? 'UTC', hour12: false, hour: 'numeric', minute: 'numeric' })} at user's local timezone`,
        `<ReminderList> ${reminders.map(({ deleted, sent, title, dueAt, rrule, description }) => {
            const time = dueAt ? `due ${humanTime(dueAt)}` : 'no due date'
            const recurs = rrule ? `repeats ${rrulestr(rrule).toText()}` : 'one-off'
            const desc = description ?? 'no description'
            return `- ${deleted || sent ? 'done/removed' : 'pending'}, ${time}, ${recurs}, ${title}, ${desc}`
        }).join('\n')} </ReminderList>`
    ]) : generateSystemPrompt([FIRST_INTERACTION_PROMPT]));
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