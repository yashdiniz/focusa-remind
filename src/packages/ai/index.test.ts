import { replyFromHistory } from ".";

// Mock the 'ai' module and its generateText function
jest.mock('ai', () => ({
    generateText: jest.fn(),
}));

import { generateText } from 'ai';

describe('replyFromHistory', () => {
    it('should return the text from the AI response', async () => {
        // Arrange
        const chatId = 'chat123';
        const userInput: { role: "system" | "user"; content: string }[] = [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello, AI!' }
        ];
        // set up the mock return value
        (generateText as jest.Mock).mockResolvedValue({ text: 'Hello, user!' });

        // Act
        const actual = await replyFromHistory(userInput, chatId);

        // Assert
        expect(actual).toBe('Hello, user!');
        // expect(generateText).toHaveBeenCalledWith(
        //     expect.objectContaining({
        //         prompt: expect.any(Array<{
        //             role: string;
        //             content: string;
        //         }>),
        //         model: expect.any(Object),
        //         providerOptions: expect.any(Object),
        //     })
        // );
    });
});