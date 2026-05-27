import React, { useRef, useState, useEffect } from 'react';
import { classNames } from '~/utils/classNames';
import { useStore } from '@nanostores/react';
import { codesmithModeStore, updateCodesmithMode } from '~/lib/stores/settings';

export type CodesmithMode = 'eco' | 'balanced' | 'performance' | 'turbo' | 'ultimate';

interface ModeDetails {
    label: string;
    icon: string;
    description: string;
    textColor: string;
    gradient: string;
    glow: string;
    tag: string;
    cssColor: string;
}

export const MODES: Record<CodesmithMode, ModeDetails> = {
    eco: {
        label: 'Eco',
        icon: 'i-ph:leaf-duotone',
        description: 'Lean 5-agent pipeline, lowest cost.',
        textColor: 'text-emerald-400',
        cssColor: '#34d399',
        gradient: 'linear-gradient(135deg,#059669,#10b981)',
        glow: '0 0 10px 1px rgba(16,185,129,0.4)',
        tag: 'Budget',
    },
    balanced: {
        label: 'Balanced',
        icon: 'i-ph:scales-duotone',
        description: '6-agent CEO-led pipeline, good quality.',
        textColor: 'text-sky-400',
        cssColor: '#38bdf8',
        gradient: 'linear-gradient(135deg,#0369a1,#38bdf8)',
        glow: '0 0 10px 1px rgba(56,189,248,0.4)',
        tag: 'Smart',
    },
    performance: {
        label: 'Performance',
        icon: 'i-ph:lightning-duotone',
        description: '17-agent full-stack pipeline.',
        textColor: 'text-amber-400',
        cssColor: '#fbbf24',
        gradient: 'linear-gradient(135deg,#b45309,#fbbf24)',
        glow: '0 0 10px 1px rgba(251,191,36,0.4)',
        tag: 'Pro',
    },
    turbo: {
        label: 'Turbo',
        icon: 'i-ph:rocket-launch-duotone',
        description: 'Thinking-mode models, 150-cycle depth.',
        textColor: 'text-rose-400',
        cssColor: '#fb7185',
        gradient: 'linear-gradient(135deg,#be123c,#fb7185)',
        glow: '0 0 10px 1px rgba(251,113,133,0.4)',
        tag: 'Fast',
    },
    ultimate: {
        label: 'Ultimate',
        icon: 'i-ph:crown-simple-duotone',
        description: '50-agent swarm, 500-cycle depth.',
        textColor: 'text-violet-400',
        cssColor: '#a78bfa',
        gradient: 'linear-gradient(135deg,#6d28d9,#a78bfa)',
        glow: '0 0 12px 2px rgba(167,139,250,0.45)',
        tag: 'Max',
    },
};

export const CodesmithModeDropdown: React.FC = () => {
    const currentModeValue = useStore(codesmithModeStore) as CodesmithMode;
    const currentMode = MODES[currentModeValue] || MODES.balanced;
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const selectMode = (mode: CodesmithMode) => {
        updateCodesmithMode(mode);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger */}
            <button
                type="button"
                title={`Codesmith: ${currentMode.label}`}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer border border-bolt-elements-borderColor bg-bolt-elements-item-backgroundDefault hover:bg-bolt-elements-item-backgroundHover transition-all duration-150"
                style={{ boxShadow: isOpen ? currentMode.glow : undefined }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span
                    className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0"
                    style={{ background: currentMode.gradient }}
                >
                    <div className={classNames('text-[11px] text-white', currentMode.icon)} />
                </span>
                <span className={classNames('text-xs font-semibold', currentMode.textColor)}>
                    {currentMode.label}
                </span>
                <div className={classNames(
                    'i-ph:caret-down text-[10px] opacity-50 transition-transform duration-150',
                    isOpen ? 'rotate-180' : '',
                    currentMode.textColor,
                )} />
            </button>

            {/* Panel */}
            {isOpen && (
                <div
                    role="listbox"
                    aria-label="Codesmith Mode"
                    className="absolute left-0 bottom-full mb-2 w-52 rounded-xl z-50 overflow-hidden border border-white/10 shadow-2xl"
                    style={{
                        background: 'var(--cs-dropdown-bg)',
                        backdropFilter: 'blur(14px)',
                        WebkitBackdropFilter: 'blur(14px)',
                        animation: 'csIn 0.13s cubic-bezier(0.16,1,0.3,1) both',
                    }}
                >
                    <div className="py-1">
                        {(Object.entries(MODES) as [CodesmithMode, ModeDetails][]).map(([key, d]) => {
                            const active = currentModeValue === key;
                            return (
                                <button
                                    key={key}
                                    role="option"
                                    aria-selected={active}
                                    className="w-full text-left px-3 py-2 flex items-center gap-2.5 relative transition-colors duration-100 hover:bg-white/5"
                                    style={{ background: active ? 'rgba(255,255,255,0.06)' : undefined }}
                                    onClick={() => selectMode(key)}
                                >
                                    {/* Active accent */}
                                    {active && (
                                        <span
                                            className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                                            style={{ background: d.gradient }}
                                        />
                                    )}

                                    {/* Icon */}
                                    <span
                                        className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0"
                                        style={{
                                            background: d.gradient,
                                            boxShadow: active ? d.glow : undefined,
                                        }}
                                    >
                                        <div className={classNames('text-sm text-white', d.icon)} />
                                    </span>

                                    {/* Text */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className="text-xs font-bold bg-clip-text text-transparent"
                                                style={{ backgroundImage: d.gradient }}
                                            >
                                                {d.label}
                                            </span>
                                            <span
                                                className="text-[8px] font-bold px-1 py-0.5 rounded-full text-white uppercase tracking-wide"
                                                style={{ background: d.gradient }}
                                            >
                                                {d.tag}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-bolt-elements-textTertiary truncate mt-0.5">
                                            {d.description}
                                        </p>
                                    </div>

                                    {active && (
                                        <div className="i-ph:check-bold text-xs flex-shrink-0" style={{ color: d.cssColor }} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <style>{`
                :root {
                    --cs-dropdown-bg: linear-gradient(160deg,rgba(255,255,255,0.88),rgba(240,240,248,0.92));
                }
                .dark {
                    --cs-dropdown-bg: linear-gradient(160deg,rgba(14,14,20,0.97),rgba(20,18,30,0.98));
                }
                @keyframes csIn {
                    from { opacity:0; transform:translateY(6px) scale(0.96); }
                    to   { opacity:1; transform:translateY(0)   scale(1);    }
                }
            `}</style>
        </div>
    );
};
