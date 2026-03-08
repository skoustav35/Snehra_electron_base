import { getSystemPrompt } from './prompts/prompts';
import optimized from './prompts/optimized';
import { getFineTunedPrompt } from './prompts/new-prompt';
import type { DesignScheme } from '~/types/design-scheme';
import type { BackendProvider } from '~/lib/stores/backend-provider';

export interface PromptOptions {
  cwd: string;
  allowedHtmlElements: string[];
  modificationTagName: string;
  designScheme?: DesignScheme;
  supabase?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };
  insforge?: {
    isConfigured: boolean;
    config?: {
      apiKey?: string;
      apiBase?: string;
    };
  };
  testsprite?: {
    isConfigured: boolean;
    config?: {
      apiKey?: string;
    };
  };
  neon?: {
    isConfigured: boolean;
    config?: {
      apiKey?: string;
    };
  };
  selectedBackendProvider?: BackendProvider;
}

export class PromptLibrary {
  static library: Record<
    string,
    {
      label: string;
      description: string;
      get: (options: PromptOptions) => string;
    }
  > = {
      default: {
        label: 'Default Prompt',
        description: 'An fine tuned prompt for better results and less token usage',
        get: (options) => getFineTunedPrompt(options.cwd, options.supabase, options.designScheme, options.insforge, options.testsprite, options.neon, options.selectedBackendProvider),
      },
      original: {
        label: 'Old Default Prompt',
        description: 'The OG battle tested default system Prompt',
        get: (options) => getSystemPrompt(options.cwd, options.supabase, options.designScheme, options.insforge, options.testsprite, options.neon, options.selectedBackendProvider),
      },
      optimized: {
        label: 'Optimized Prompt (experimental)',
        description: 'An Experimental version of the prompt for lower token usage',
        get: (options) => optimized(options),
      },
    };
  static getList() {
    return Object.entries(this.library).map(([key, value]) => {
      const { label, description } = value;
      return {
        id: key,
        label,
        description,
      };
    });
  }
  static getPropmtFromLibrary(promptId: string, options: PromptOptions) {
    const prompt = this.library[promptId];

    if (!prompt) {
      throw 'Prompt Now Found';
    }

    return this.library[promptId]?.get(options);
  }
}

