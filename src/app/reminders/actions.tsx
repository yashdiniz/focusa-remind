'use server'
import { env } from '@/env';
import { validate } from '@tma.js/init-data-node'

export async function validateSession(initData: string) {
    try {
        validate(initData, env.TELEGRAM_BOT_TOKEN);
        return true;
    } catch (e) {
        console.error('Init data validation failed:', e);
        return false;
    }
}