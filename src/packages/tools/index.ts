import { type ToolSet } from "ai";
import { type User } from "@/server/db/schema";
import { userTools } from "./user";
import { reminderTools } from "./reminder";
import { summaryTools } from "./summary";

/**
 * Toolset for the AI agent. Wraps each tool with user context.
 * @param user Context containing user details.
 * @returns ToolSet with user-specific tool implementations.
 */
export function tools(user: User): ToolSet {
    if (!user.metadata) {
        // if the user hasn't onboarded yet, they can only access user tools
        return {
            ...userTools(user),
        }
    }
    // otherwise they can access all tools
    return {
        ...userTools(user),
        ...reminderTools(user),
        ...summaryTools(user),
    }
}