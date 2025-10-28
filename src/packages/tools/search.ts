import { z } from "zod";
import { tool } from "ai";
import type { User } from "@/server/db/schema";
import { env } from "@/env";

const searchInternet = (user: User) => tool({
    name: "search.internet",
    description: "Search the internet using Google. Run when explicitly asked or when searching for general information would be helpful.",
    inputSchema: z.object({
        informationToGet: z.string().describe("Terms to search for on the Internet"),
    }),
    execute: async ({ informationToGet: q }) => {
        try {
            const res = await fetch(`https://api.scrapingdog.com/google?api_key=${env.SCRAPINGDOG_API_KEY}&query=${encodeURIComponent(q)}&country=in&language=en`);
            const data: unknown = await res.json();
            console.log(`${user.platform}-${user.identifier}`, "search.internet tool called with query:", q, "response:", data);
            return data;
        } catch (e) {
            console.error("Error in search.internet tool:", e);
            return "Error occurred while searching the internet.";
        }
    }
})

// const searchYouTube = (user: User) => tool({
//     name: "search.youtube",
//     description: "Search videos on YouTube. Run when explicitly asked for YouTube videos or when searching for video content would be helpful.",
//     inputSchema: z.object({
//         videoToSearch: z.string().describe("Terms to search for on YouTube"),
//     }),
//     execute: async ({ videoToSearch: q }) => {
//         try {
//             const res = await fetch(`https://api.scrapingdog.com/youtube?api_key=${env.SCRAPINGDOG_API_KEY}&query=${encodeURIComponent(q)}&country=in&language=en`);
//             const data = await res.json();
//             console.log(`${user.platform}-${user.identifier}`, "search.youtube tool called with query:", q, "response:", data);
//             return data;
//         } catch (e) {
//             console.error("Error in search.youtube tool:", e);
//             return "Error occurred while searching YouTube.";
//         }
//     }
// })

export function searchTools(user: User) {
    return {
        ...(user.metadata ? {
            searchInternet: searchInternet(user),
            // searchYouTube: searchYouTube(user),
        } : undefined)
    }
}