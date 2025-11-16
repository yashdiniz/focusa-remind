import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { users, type User } from "@/server/db/schema";
import { z } from "zod";
import { tool } from "ai";
import { /*updateBio,*/ validateTimezone } from "../utils";
import { encode } from "@toon-format/toon";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
dayjs.extend(utc)
dayjs.extend(timezone)

const upsert = (user: User) => tool({
    description: "Update user preferences/information",
    inputSchema: z.object({
        name: z.string().describe("preferred name"),
        language: z.string().describe("preferred language"),
        timezone: z.string().describe("timezone, expect Intl.DateTimeFormat like 'America/New_York'")
            .refine(validateTimezone, {
                error: "Expect valid Intl.DateTimeFormat like 'America/New_York' or 'Asia/Kolkata'"
            }),
    }),
    async execute(input) {
        console.log(`${user.platform}-${user.identifier}`, "userInfo tool called with input:", input);
        if (input.name.toLowerCase().includes('focusa')) {
            return encode({
                success: false,
                error: "Your name is FOCUSA Remind, user's name cannot be FOCUSA. Proceed with onboarding",
            })
        }

        await db.update(users).set({
            metadata: {
                ...user.metadata,
                ...input, // overwrite inputs
            }
        }).where(eq(users.id, user.id)).execute();
        console.log(`${user.platform}-${user.identifier}`, "userInfo updated");
        return encode({ success: true });
    }
});

export function userTools(user: User) {
    return {
        userInfo: upsert(user),
        // add these only after onboarding
        ...(user.metadata ? {} : undefined),
    }
}