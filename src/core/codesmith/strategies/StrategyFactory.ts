import type { AgentStrategy } from './AgentStrategy';
import { ArchitectStrategy } from './ArchitectStrategy';
import { BuilderStrategy } from './BuilderStrategy';
import { TesterStrategy } from './TesterStrategy';
import { DebuggerStrategy } from './DebuggerStrategy';
import { ReviewerStrategy } from './ReviewerStrategy';
import { GenericStrategy } from './GenericStrategy';
import { CEOAgentStrategy } from '../../shims/ceo-agent-strategy';

export class StrategyFactory {
  private static strategies = new Map<string, AgentStrategy>([
    ['ceo', new CEOAgentStrategy()],
    ['architect', new ArchitectStrategy()],
    ['builder', new BuilderStrategy()],
    ['tester', new TesterStrategy()],
    ['debugger', new DebuggerStrategy()],
    ['reviewer', new ReviewerStrategy()],
    ['generic', new GenericStrategy()]
  ]);

  static get(role: string): AgentStrategy {
    const strategy = this.strategies.get(role);
    if (!strategy) {
      return this.strategies.get('generic')!;
    }
    return strategy;
  }
}
