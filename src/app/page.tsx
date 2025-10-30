'use client'
// Import the necessary styles globally
import '@telegram-apps/telegram-ui/dist/styles.css';

// Import components from the library
import { AppRoot, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { retrieveRawInitData } from '@tma.js/sdk-react';
import { useEffect, useState } from 'react';

// Example data for rendering list cells
const cellsTexts = ['Chat Settings', 'Data and Storage', 'Devices'];

export default function App() {
    const [initData, setInitData] = useState<string>('');
    useEffect(() => {
        setInitData(retrieveRawInitData() ?? '');
    }, []);

    return (
        <AppRoot>
            {/* List component to display a collection of items */}
            <List>
                {/* Section component to group items within the list */}
                <Section header="Header for the section" footer={initData}>
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