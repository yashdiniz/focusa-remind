import { generateResponse } from ".";

// Mock the 'ai' module and its generateText function
jest.mock('ai', () => ({
    generateText: jest.fn(),
}));

import { generateText } from 'ai';

describe('generateResponse', () => {
    it('should return the text from the AI response', async () => {
        // Arrange
        const chatId = 'chat123';
        const userInput = 'Hi there!';
        // set up the mock return value
        (generateText as jest.Mock).mockResolvedValue({ text: 'Hello, user!' });

        // Act
        const actual = await generateResponse(chatId, userInput);

        // Assert
        expect(actual).toBe('Hello, user!');
        expect(generateText).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: expect.any(Array<{
                    role: string;
                    content: string;
                }>),
                model: expect.any(Object),
                providerOptions: expect.any(Object),
            })
        );
    });
});