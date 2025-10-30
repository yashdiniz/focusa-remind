// Import the necessary styles globally
import '@telegram-apps/telegram-ui/dist/styles.css';

// Import components from the library
import { AppRoot, Cell, Section, List } from '@telegram-apps/telegram-ui';
import { db } from '@/server/db';
import dayjs from 'dayjs';
import { rrulestr } from 'rrule';

export default async function App({ params }: { params: { chatId: string } }) {
    const user = await db.query.users.findFirst({
        where: (users, { and, eq }) => and(eq(users.platform, 'telegram'), eq(users.identifier, params.chatId)),
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
                            {`Title: ${reminder.title}
Description: ${reminder.description}
due: ${dayjs(reminder.dueAt).format('YYYY-MM-DD HH:MM')}
Deleted: ${reminder.deleted}
sent: ${reminder.sent}
priority: ${reminder.priority}
rrule: ${reminder.rrule ? rrulestr(reminder.rrule).toText() : ''}${reminder.rrule}`}
                        </Cell>
                    ))}
                </Section>
            </List>
        </AppRoot>
    )
};