import { describe, expect, it } from 'vitest';
import type { ProviderInfo } from '~/types/model';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { getFilteredModels, getFilteredProviders, getFirstModelForProvider, highlightText } from './model-selector.utils';

const providers: ProviderInfo[] = [
  { name: 'OpenRouter', staticModels: [] },
  { name: 'Anthropic', staticModels: [] },
];

const models: ModelInfo[] = [
  {
    name: 'openrouter-free',
    label: 'OpenRouter Free in:$0.00 out:$0.00',
    provider: 'OpenRouter',
    maxTokenAllowed: 128000,
  },
  {
    name: 'openrouter-pro',
    label: 'OpenRouter Pro',
    provider: 'OpenRouter',
    maxTokenAllowed: 256000,
  },
  {
    name: 'claude-sonnet',
    label: 'Claude Sonnet',
    provider: 'Anthropic',
    maxTokenAllowed: 200000,
  },
];

describe('model selector helpers', () => {
  it('filters OpenRouter results down to likely free models', () => {
    const filtered = getFilteredModels(models, 'OpenRouter', '', true);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('openrouter-free');
  });

  it('returns the first model for a provider when switching providers', () => {
    const nextModel = getFirstModelForProvider(models, 'Anthropic');

    expect(nextModel?.name).toBe('claude-sonnet');
  });

  it('keeps fuzzy provider search behavior intact', () => {
    const filtered = getFilteredProviders(providers, 'anthr');

    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Anthropic');
  });

  it('wraps matched text with the platinum highlight marker', () => {
    expect(highlightText('Claude Sonnet', 'sonnet')).toContain('platinum-highlight');
  });
});
