import React from 'react';
import type { Template } from '~/types/template';
import { STARTER_TEMPLATES } from '~/utils/constants';

interface FrameworkLinkProps {
  template: Template;
}

const FrameworkLink: React.FC<FrameworkLinkProps> = ({ template }) => (
  <a
    href={`/git?url=https://github.com/${template.githubRepo}.git`}
    data-state="closed"
    data-discover="true"
    className="group items-center justify-center"
  >
    <div
      className={`inline-block ${template.icon} w-8 h-8 text-4xl transition-all duration-300 text-bolt-elements-textTertiary opacity-50 group-hover:opacity-100 group-hover:text-purple-500 dark:group-hover:text-purple-400 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(158,117,240,0.3)]`}
      title={template.label}
    />
  </a>
);

const StarterTemplates: React.FC = () => {
  return (
    <div
      className="flex flex-col items-center gap-4 animate-fade-in-up"
      style={{ animationDelay: '0.55s' }}
    >
      <span className="text-sm text-bolt-elements-textTertiary font-medium">
        or start a blank app with your favorite stack
      </span>
      <div className="flex justify-center">
        <div className="flex flex-wrap justify-center items-center gap-4 max-w-sm">
          {STARTER_TEMPLATES.map((template) => (
            <FrameworkLink key={template.name} template={template} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default StarterTemplates;
