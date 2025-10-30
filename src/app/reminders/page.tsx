'use client'

// Import the necessary styles globally
import '@telegram-apps/telegram-ui/dist/styles.css';

// Import components from the library
import { AppRoot, Cell, Section } from '@telegram-apps/telegram-ui';
import { init, retrieveRawInitData } from '@tma.js/sdk-react';
import { useEffect, useState } from 'react';
import { getRemindersForSession, getSession } from './actions';
import dayjs from 'dayjs';
import { rrulestr } from 'rrule';

export default function App() {
    const [reminders, setReminders] = useState<Awaited<ReturnType<typeof getRemindersForSession>>>([]);
    const [session, setSession] = useState<string>('');
    useEffect(() => {
        init()
        try {
            const initData = retrieveRawInitData() ?? '';
            setSession(JSON.stringify(getSession(initData)) ?? '');
            getRemindersForSession(initData).then(reminders => {
                if (reminders) setReminders(reminders)
                else setReminders([])
            }).catch(e => {
                throw e;
            });
        } catch (e) {
            console.error('Error during authentication:', e);
        }
    }, []);

    return (
        <AppRoot>
            <Section header="Your Reminders" footer={session}>
                {reminders!.map((reminder) => (
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
        </AppRoot>
    )
};