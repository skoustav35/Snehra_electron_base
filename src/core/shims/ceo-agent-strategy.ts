/**
 * CEOAgentStrategy shim — replaces @core/agents/ceo-agent.strategy.
 * Delegates to GenericStrategy since the CEO strategy in the original
 * backend is not available in this repo.
 */
import { GenericStrategy } from '../codesmith/strategies/GenericStrategy';

export class CEOAgentStrategy extends GenericStrategy { }
