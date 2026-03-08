import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { streamingState } from '~/lib/stores/streaming';
import { DeployButton } from '~/components/deploy/DeployButton';
import { useGitHubDeploy } from '~/components/deploy/GitHubDeploy.client';
import { GitHubDeploymentDialog } from '~/components/deploy/GitHubDeploymentDialog';

interface HeaderActionButtonsProps {
  chatStarted: boolean;
}

export function HeaderActionButtons({ chatStarted: _chatStarted }: HeaderActionButtonsProps) {
  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];
  const streaming = useStore(streamingState);

  const { handleGitHubDeploy } = useGitHubDeploy();
  const [showGitHubDialog, setShowGitHubDialog] = useState(false);
  const [githubFiles, setGithubFiles] = useState<Record<string, string> | null>(null);
  const [githubProjectName, setGithubProjectName] = useState('');

  const shouldShowButtons = activePreview;

  const handleSaveToGitHub = async () => {
    const result = await handleGitHubDeploy();
    if (result && result.success && result.files) {
      setGithubFiles(result.files);
      setGithubProjectName(result.projectName);
      setShowGitHubDialog(true);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Save to GitHub */}
        {shouldShowButtons && (
          <button
            onClick={handleSaveToGitHub}
            disabled={streaming}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-bolt-elements-borderColor bg-bolt-elements-item-backgroundDefault hover:bg-bolt-elements-item-backgroundHover text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save project to a GitHub repository"
          >
            <div className="i-ph:github-logo text-sm" />
            <span>Save to GitHub</span>
          </button>
        )}

        {/* Deploy Button */}
        {shouldShowButtons && <DeployButton />}
      </div>

      {/* GitHub Deployment Dialog */}
      {showGitHubDialog && githubFiles && (
        <GitHubDeploymentDialog
          isOpen={showGitHubDialog}
          onClose={() => setShowGitHubDialog(false)}
          projectName={githubProjectName}
          files={githubFiles}
        />
      )}
    </>
  );
}
