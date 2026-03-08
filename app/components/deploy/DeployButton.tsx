import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { streamingState } from '~/lib/stores/streaming';
import { classNames } from '~/utils/classNames';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { isInsforgeReady } from '~/lib/stores/insforge';
import { isNeonReady } from '~/lib/stores/neon';
import { useBackendProviderStore } from '~/lib/stores/backend-provider';

// Insforge logo SVG
const InsforgeLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <defs>
      <linearGradient id="deploy-insforge-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#8b5cf6" />
      </linearGradient>
    </defs>
    <path fill="url(#deploy-insforge-grad)" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

// Neon logo SVG
const NeonLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="#00E599" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
  </svg>
);

export const DeployButton = () => {
  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];
  const [isDeploying, setIsDeploying] = useState(false);
  const isStreaming = useStore(streamingState);
  const { selectedProvider } = useBackendProviderStore();

  const handleDeployClick = async () => {
    if (selectedProvider === 'insforge') {
      if (!isInsforgeReady()) {
        toast.error('Insforge is not configured. Go to Settings > Insforge to add your API keys.', {
          autoClose: 5000,
        });
        return;
      }
    } else {
      if (!isNeonReady()) {
        toast.error('Neon is not configured. Go to Settings > Neon to add your API key.', {
          autoClose: 5000,
        });
        return;
      }
    }

    setIsDeploying(true);

    try {
      if (selectedProvider === 'insforge') {
        const deployEvent = new CustomEvent('bolt:deploy-with-insforge', {
          detail: {
            prompt: 'deploy this app with insforge and give me the url',
            mode: 'balanced',
          },
        });
        window.dispatchEvent(deployEvent);
        toast.info('Deploying with Insforge...', { autoClose: 3000 });
      } else {
        const deployEvent = new CustomEvent('bolt:deploy-with-neon', {
          detail: {
            prompt: 'deploy this app with Neon database configured and give me the live URL',
            mode: 'balanced',
          },
        });
        window.dispatchEvent(deployEvent);
        toast.info('Deploying with Neon...', { autoClose: 3000 });
      }
    } catch (error) {
      toast.error(`Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTimeout(() => setIsDeploying(false), 2000);
    }
  };

  const isNeon = selectedProvider === 'neon';

  return (
    <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden text-sm">
      <button
        disabled={isDeploying || !activePreview || isStreaming}
        onClick={handleDeployClick}
        className={classNames(
          'rounded-md items-center justify-center',
          '[&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-60',
          'px-3 py-1.5 text-xs',
          isNeon
            ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:from-emerald-600 hover:to-green-600'
            : 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600',
          '[&:not(:disabled,.disabled)]:hover:shadow-md',
          'outline-accent-500 flex gap-1.7',
          'transition-all duration-200',
        )}
      >
        {isDeploying ? (
          <>
            <div className="i-svg-spinners:90-ring-with-bg w-4 h-4 animate-spin" />
            Deploying...
          </>
        ) : (
          <>
            {isNeon ? <NeonLogo /> : <InsforgeLogo />}
            Deploy with {isNeon ? 'Neon DB' : 'Insforge'}
          </>
        )}
      </button>
    </div>
  );
};
