import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';

export const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      matrix[i][j] =
        str2.charAt(i - 1) === str1.charAt(j - 1)
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }

  return matrix[str2.length][str1.length];
};

export const fuzzyMatch = (query: string, text: string): { score: number; matches: boolean } => {
  if (!query) {
    return { score: 0, matches: true };
  }

  if (!text) {
    return { score: 0, matches: false };
  }

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  if (textLower.includes(queryLower)) {
    return { score: 100 - (textLower.indexOf(queryLower) / textLower.length) * 20, matches: true };
  }

  const distance = levenshteinDistance(queryLower, textLower);
  const maxLen = Math.max(queryLower.length, textLower.length);
  const similarity = 1 - distance / maxLen;

  return { score: similarity > 0.6 ? similarity * 80 : 0, matches: similarity > 0.6 };
};

export const highlightText = (text: string, query: string): string => {
  if (!query) {
    return text;
  }

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark class="platinum-highlight">$1</mark>');
};

export const formatContextSize = (tokens: number): string => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }

  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }

  return tokens.toString();
};

export const isModelLikelyFree = (model: ModelInfo, providerName?: string): boolean => {
  if (providerName === 'OpenRouter' && model.label.includes('in:$0.00') && model.label.includes('out:$0.00')) {
    return true;
  }

  return model.name.toLowerCase().includes('free') || model.label.toLowerCase().includes('free');
};

export function getFirstModelForProvider(modelList: ModelInfo[], providerName: string) {
  return modelList.find((model) => model.provider === providerName);
}

export function getFilteredProviders(providerList: ProviderInfo[], searchQuery: string) {
  if (!searchQuery) {
    return providerList;
  }

  return providerList
    .map((provider) => {
      const match = fuzzyMatch(searchQuery, provider.name);
      return { ...provider, searchScore: match.score, searchMatches: match.matches };
    })
    .filter((provider) => provider.searchMatches)
    .sort((a, b) => b.searchScore - a.searchScore);
}

export function getFilteredModels(
  modelList: ModelInfo[],
  providerName: string | undefined,
  searchQuery: string,
  showFreeModelsOnly: boolean,
) {
  return modelList
    .filter((model) => model.provider === providerName && model.name)
    .filter((model) => !showFreeModelsOnly || isModelLikelyFree(model, providerName))
    .map((model) => {
      const labelMatch = fuzzyMatch(searchQuery, model.label);
      const nameMatch = fuzzyMatch(searchQuery, model.name);
      const contextMatch = fuzzyMatch(searchQuery, formatContextSize(model.maxTokenAllowed));
      const score = Math.max(labelMatch.score, nameMatch.score, contextMatch.score);
      const matches = labelMatch.matches || nameMatch.matches || contextMatch.matches || !searchQuery;

      return { ...model, searchScore: score, searchMatches: matches };
    })
    .filter((model) => model.searchMatches)
    .sort((a, b) => (searchQuery ? b.searchScore - a.searchScore : a.label.localeCompare(b.label)));
}
