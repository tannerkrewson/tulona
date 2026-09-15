import { PersistenceError } from '@data';

import { bootCoordinator } from '../orchestration/boot-coordinator';
import type { GoalService } from './goal-service';

export interface GoalsRuntime {
  goalService: GoalService;
}

export async function loadGoalsRuntime(): Promise<GoalsRuntime> {
  const result = await bootCoordinator.hydrate();
  if (!result.runtime) throw new PersistenceError('metadata', 'Create or activate a dataset first');
  return { goalService: result.runtime.services.goals };
}
