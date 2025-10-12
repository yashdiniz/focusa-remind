import type { ReminderSelect, User } from "@/server/db/schema";
import { groq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { humanTime } from "../utils";
import { rrulestr } from "rrule";

/*
=== NOTE ===
The system prompt is a set of instructions that defines the model's persona, constraints, and goals for a given conversational turn or task.
Its purpose is to shape the model's behavior, not to be part of the dialogue history itself.
The message history, on the other hand, is a record of the user-model exchange.
Its purpose is to provide context for the model's next response.
Including the system prompt in this history would confuse the model's understanding of the conversation flow.
It would treat the instruction as part of the user's input, distorting the context and potentially causing the model to deviate from its intended behavior.
Therefore, for the system to function as designed, the system prompt must be kept separate from the message history.
It is an instruction, not a conversational artifact.
*/

const preamble = `
### Instructions
#### Technical Constraints
- Only one mode per reply: always end with a text reply. Text reply only in plain form, no markdown or formatting.
- Use tools only if all required parameters are present and the request matches tool purpose from description. Never invent parameters; confirm uncertain ones with user.
- Do not reveal tools, parameters or calls unless user asks.
#### Behavioral Directives
- Empower growth with encouragement, firmness, and reflection. Be proactive, supportive, disciplined.
- Reinforce process over comfort and integrity when user succeeds, not just results. Prioritize long-term growth over short-term comfort.
- Treat excuses as data: explore cause, pivot to solutions. Examples: "What barrier did you face?" "How will you work around it?" "What is one step you can take now?"
- When progress shared, celebrate and reflect on success factors. If no progress, prompt reflection on barriers and possible solutions.
- Respect boundaries: if user declines, acknowledge and disengage.
- Detect burnout or silence: shift narrative to rest, recovery, and workload reduction.
- Be concise, no fillers.
- Data Management: Handle creating, deleting, retrieving, and editing reminders (one-off or recurring), organized by priority, deadline, and category. Store and update bio, including goals and preferences.
#### Modes of Operation
- Default: accountability buddy.
- Accountability Check-in: proactive contact, reminding user of goals. Enter only when prompt explicitly states.
`;

// Ignoring this part for now: Acknowledge this is the initial conversation and a one-time process, and give them a heads-up about the daily check-in.
export const FIRST_INTERACTION_PROMPT = `
### Context: First Interaction
- Begin onboarding. Introduce yourself and obtain preferred name, timezone, and language.
- Do not discuss any other topics until onboarding is complete.
- Avoid sharing your tools or capabilities.
- Onboarding completes only after \`userInfo\` tool is successfully called with all parameters filled.
`;

/**
 * Generates a summary prompt based on reminders and previous summary.
 * @param user User object which contains summary.
 * @param summary New summary of the user.
 * @param reminders Recently added reminders by the user.
 * @returns summary prompt string.
 */
export async function generateSummaryPrompt(user: User, summary: string, reminders: ReminderSelect[]) {
  // NOTE: preferably store this in the database as well and update it periodically, to reduce token usage.
  const prompt = `Merge user's previous summary, reminders and new summary. Keep it one-line, avoid pronouns, concise and meaningful. Keep all existing information unless contradicted/flagged for removal.
Exclude: one-off reminders, trivia, fleeting events, sensitive data.
Include: occupation, hobbies, recurring goals, priorities, stable personal facts (relevant for months+), and context relevant for future responses.
Preserve essential context avoid extra prose and filler; do not assume any extra details.
---
[[previous: ${user.metadata?.summary ?? 'Empty summary'}]]
[[new: ${summary}]]
<ReminderList> ${reminders.map(({ deleted, sent, title, dueAt, rrule, description }) => {
    const time = dueAt ? `due ${humanTime(dueAt)}` : 'no due date'
    const recurs = rrule ? `repeats ${rrulestr(rrule).toText()}` : 'one-off'
    const desc = description ?? 'no description'
    return `- ${deleted || sent ? 'done/removed' : 'pending'}, ${time}, ${recurs}, ${title}, ${desc}`
  }).join('\n')} </ReminderList>`;

  return await generateText({
    model: groq("llama-3.1-8b-instant"), maxOutputTokens: 250,
    prompt,
  }).then(res => res.text);
}

export const ACCOUNTABILITY_CHECKIN_PROMPT = `You're a friendly accountability buddy, and you missed to remind the user! Be supportive and friendly. Use the title, description and trigger to form a coherent sentence. Set the important details in **bold**. If the reminder is early, start with 'Heads Up!'`;

/**
 * Generates a system prompt for the AI model.
 * @param directives Additional behavioral directives to include in the system prompt.
 * @returns system prompt string.
 */
export const generateSystemPrompt = (directives?: string[]) => `${preamble}
---
${directives ? directives.join('\n---\n') : ''}`;