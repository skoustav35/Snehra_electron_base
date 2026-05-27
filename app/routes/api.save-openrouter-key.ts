import { json, type ActionFunction } from '@remix-run/cloudflare';
import fs from 'node:fs';
import path from 'node:path';

export const action: ActionFunction = async ({ request }) => {
    if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, { status: 405 });
    }

    const formData = await request.formData();
    const openRouterKey = formData.get('openRouterKey')?.toString();

    if (!openRouterKey) {
        return json({ error: 'OpenRouter API Key is required' }, { status: 400 });
    }

    try {
        const cwd = process.cwd();
        const envPath = path.join(cwd, 'config', 'admin.env');
        let envContent = '';

        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }

        const lines = envContent.split('\n');
        let found = false;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('OPENROUTER_API_KEY=')) {
                lines[i] = `OPENROUTER_API_KEY=${openRouterKey}`;
                found = true;
                break;
            }
        }

        if (!found) {
            lines.push(`OPENROUTER_API_KEY=${openRouterKey}`);
        }

        fs.writeFileSync(envPath, lines.join('\n'));
        return json({ success: true });
    } catch (error) {
        console.error('Failed to save to admin.env', error);
        return json({ error: 'Failed to save admin.env' }, { status: 500 });
    }
};
