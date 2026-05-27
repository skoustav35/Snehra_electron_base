import React, { useState } from 'react';
import { toast } from 'react-toastify';

export const OpenRouterAPIKeyManager: React.FC = () => {
    const [key, setKey] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!key) {
            toast.error('Please enter an OpenRouter API key');
            return;
        }

        setIsSaving(true);
        try {
            const formData = new FormData();
            formData.append('openRouterKey', key);

            const response = await fetch('/api/save-openrouter-key', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                toast.success('OpenRouter API Key saved to admin.env successfully');
            } else {
                const errorData = (await response.json()) as any;
                toast.error(errorData.error || 'Failed to save API key');
            }
        } catch (err) {
            toast.error('Network error. Failed to save the API key.');
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-3 p-4 bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor">
            <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">
                Codesmith Integration (OpenRouter)
            </h3>
            <p className="text-xs text-bolt-elements-textTertiary">
                Enter your OpenRouter API key below. It will be saved securely to <code className="bg-bolt-elements-background-depth-3 px-1 py-0.5 rounded">admin.env</code> for powering <b>src/codesmith</b>.
            </p>

            <div className="flex items-center gap-3 mt-2">
                <div className="relative flex-1">
                    <input
                        type="password"
                        className="w-full bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor text-bolt-elements-textPrimary rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-bolt-elements-focus transition-all"
                        placeholder="sk-or-v1-..."
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                    />
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover text-bolt-elements-button-primary-text px-4 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save Key'}
                </button>
            </div>
        </div>
    );
};
