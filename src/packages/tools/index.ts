import { type ToolSet } from "ai";
import { type User } from "@/server/db/schema";
import { userTools } from "./user";
import { reminderTools } from "./reminder";
import { searchTools } from "./search";
import Supermemory from "supermemory";
import { env } from "@/env";

/**
 * Toolset for the AI agent. Wraps each tool with user context.
 * @param user Context containing user details.
 * @returns ToolSet with user-specific tool implementations.
 */
export function tools(user: User): ToolSet {
    const client = new Supermemory({
        apiKey: env.SUPERMEMORY_API_KEY,
    })

    // otherwise they can access all tools
    return {
        ...userTools(user, client),
        ...reminderTools(user, client),
        ...searchTools(user),
    }
}