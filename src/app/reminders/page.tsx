'use client'

// Import the necessary styles globally
import '@telegram-apps/telegram-ui/dist/styles.css';

// Import components from the library
import { AppRoot, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { retrieveRawInitData } from '@tma.js/sdk-react';
import { useEffect, useState } from 'react';
import { validateSession } from './actions';

// Example data for rendering list cells
const cellsTexts = ['Chat Settings', 'Data and Storage', 'Devices'];

export default function App() {
    const [authenticated, setAuthenticated] = useState(false);
    useEffect(() => {
        const initData = retrieveRawInitData() ?? '';
        validateSession(initData).then(setAuthenticated).catch(console.error);
    }, []);
    if (!authenticated) {
        return <div>Authenticating...</div>;
    }

    return (
        <AppRoot>
            {/* List component to display a collection of items */}
            <List>
                {/* Section component to group items within the list */}
                <Section header="Header for the section" footer="Footer for the section">
                    {/* Mapping through the cells data to render Cell components */}
                    {cellsTexts.map((cellText, index) => (
                        <Cell key={index}>
                            {cellText}
                        </Cell>
                    ))}
                </Section>
            </List>
        </AppRoot>
    )
};