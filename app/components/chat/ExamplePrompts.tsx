import React from 'react';

const EXAMPLE_PROMPTS = [
  { text: 'Create a mobile app about bolt.diy', icon: 'i-ph:device-mobile-duotone' },
  { text: 'Build a todo app in React using Tailwind', icon: 'i-ph:check-square-duotone' },
  { text: 'Build a simple blog using Astro', icon: 'i-ph:article-duotone' },
  { text: 'Create a cookie consent form using Material UI', icon: 'i-ph:cookie-duotone' },
  { text: 'Make a space invaders game', icon: 'i-ph:game-controller-duotone' },
  { text: 'Make a Tic Tac Toe game in html, css and js only', icon: 'i-ph:hash-duotone' },
];

export function ExamplePrompts(sendMessage?: { (event: React.UIEvent, messageInput?: string): void | undefined }) {
  return (
    <div id="examples" className="relative flex flex-col gap-9 w-full max-w-3xl mx-auto flex justify-center mt-6">
      <div
        className="flex flex-wrap justify-center gap-2.5 animate-fade-in-up"
        style={{ animationDelay: '0.45s' }}
      >
        {EXAMPLE_PROMPTS.map((examplePrompt, index: number) => {
          return (
            <button
              key={index}
              onClick={(event) => {
                sendMessage?.(event, examplePrompt.text);
              }}
              className="group flex items-center gap-2 border border-bolt-elements-borderColor rounded-full glass-panel text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary px-4 py-2 text-xs font-medium transition-all duration-250 hover-glow hover:border-[rgba(158,117,240,0.35)] active:scale-[0.97]"
            >
              <span className={`${examplePrompt.icon} w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity duration-200`} />
              {examplePrompt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
