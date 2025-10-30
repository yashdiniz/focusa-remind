'use server'
import { env } from '@/env';
import { validate, parse } from '@tma.js/init-data-node'

export async function validateSession(authData: string) {
    try {
        validate(authData, env.TELEGRAM_BOT_TOKEN, {
            expiresIn: 600, // 10 minutes
        });
        const session = parse(authData)
        return session;
    } catch (e) {
        console.error('Init data validation failed:', e);
        throw e;
    }
}