import { type ToolSet } from "ai";
import { type User } from "@/server/db/schema";
import { userTools } from "./user";
import { reminderTools } from "./reminder";

/**
 * Toolset for the AI agent. Wraps each tool with user context.
 * @param user Context containing user details.
 * @returns ToolSet with user-specific tool implementations.
 */
export function tools(user: User): ToolSet {
    // otherwise they can access all tools
    return {
        ...userTools(user),
        ...reminderTools(user),
    }
}