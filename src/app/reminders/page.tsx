// Import the necessary styles globally
import '@telegram-apps/telegram-ui/dist/styles.css';

// Import components from the library
import { AppRoot, Cell, Section, List } from '@telegram-apps/telegram-ui';
import { db } from '@/server/db';
import dayjs from 'dayjs';
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { rrulestr } from 'rrule';
dayjs.extend(utc)
dayjs.extend(timezone)

export default async function App({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
    const platform = (await searchParams).platform as 'telegram' | 'slack';
    const chatId = (await searchParams).chatId;
    if (!chatId || !platform) return <div>No chatId provided</div>

    const user = await db.query.users.findFirst({
        where: (users, { and, eq }) => and(eq(users.platform, platform), eq(users.identifier, chatId)),
    }).execute();
    if (!user) return <div>Could not find user</div>

    const reminders = await db.query.reminders.findMany({
        where: (reminders, { eq }) => eq(reminders.userId, user.id),
        orderBy: (reminders, { desc }) => desc(reminders.createdAt),
    }).execute()

    return (
        <AppRoot>
            <List>
                <Section header="Your Reminders" footer="End of Reminders">
                    {reminders.map((reminder) => (
                        <Cell key={reminder.id}>
                            Title: {reminder.title} <br />
                            Description: {reminder.description} <br />
                            due: {dayjs(reminder.dueAt).tz(user.metadata?.timezone ?? 'UTC').format('YYYY-MM-DD HH:mm')} <br />
                            Deleted: {reminder.deleted} <br />
                            sent: {reminder.sent} <br />
                            priority: {reminder.priority} <br />
                            rrule: {reminder.rrule ? rrulestr(reminder.rrule).toText() : ''} <br />
                        </Cell>
                    ))}
                </Section>
            </List>
        </AppRoot>
    )
};