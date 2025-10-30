'use client'

// Import the necessary styles globally
import '@telegram-apps/telegram-ui/dist/styles.css';

// Import components from the library
import { AppRoot, Cell, Section } from '@telegram-apps/telegram-ui';
import { retrieveRawInitData } from '@tma.js/sdk-react';
import { useEffect, useState } from 'react';
import { getRemindersForSession } from './actions';
import type { ReminderSelect } from '@/server/db/schema';
import dayjs from 'dayjs';
import { humanTime } from '@/packages/utils';
import { rrulestr } from 'rrule';

export default function App() {
    const [reminders, setReminders] = useState<ReminderSelect[]>([]);
    useEffect(() => {
        try {
            const initData = retrieveRawInitData() ?? '';
            getRemindersForSession(initData).then(reminders => {
                if (reminders) setReminders(reminders)
            }).catch(e => {
                throw e;
            });
        } catch (e) {
            console.error('Error during authentication:', e);
        }
    }, []);

    return (
        <AppRoot>
            <Section header="Your Reminders" footer="No more reminders">
                {reminders.map((reminder) => (
                    <Cell key={reminder.id}>
                        {`Title: ${reminder.title}
Description: ${reminder.description}
due: ${reminder.dueAt ? humanTime(reminder.dueAt) : ''}${dayjs(reminder.dueAt).format('YYYY-MM-DD HH:MM')}
Deleted: ${reminder.deleted}
sent: ${reminder.sent}
priority: ${reminder.priority}
rrule: ${reminder.rrule ? rrulestr(reminder.rrule).toText() : ''}${reminder.rrule}`}
                    </Cell>
                ))}
            </Section>
        </AppRoot>
    )
};