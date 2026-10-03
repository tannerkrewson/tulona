import type { Snapshot } from './dropbox';

export interface Presentation {
  detail?: 'compact' | 'full';
  fields?: string[];
  diagnostics?: boolean;
}

export const minutes = (milliseconds: number) => Math.round((milliseconds / 60_000) * 1000) / 1000;

export function cutoff(snapshot: Snapshot) {
  return Math.min(Date.now(), Date.parse(snapshot.backup.exportedAt));
}

export function source(snapshot: Snapshot, diagnostics = false) {
  return {
    exportedAt: snapshot.backup.exportedAt,
    observedThrough: new Date(cutoff(snapshot)).toISOString(),
    age_minutes: minutes(Math.max(0, Date.now() - Date.parse(snapshot.backup.exportedAt))),
    ...(diagnostics ? snapshot.source : {}),
  };
}

/** Preserve false/zero values, omit absent cosmetics, and use minutes in compact views. */
export function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, item]) =>
          item != null &&
          ![
            'color',
            'folderColor',
            'iconName',
            'createdAt',
            'updatedAt',
            'capturedAt',
            'sortOrder',
          ].includes(key)
      )
      .map(([key, item]) =>
        key.endsWith('Ms') && typeof item === 'number'
          ? [key.slice(0, -2) + 'Minutes', minutes(item)]
          : [key, compact(item)]
      )
  );
}

export function names(snapshot: Snapshot) {
  return new Map(
    [
      ...snapshot.backup.catalog.folders,
      ...snapshot.backup.catalog.activities,
      ...snapshot.backup.catalog.routines,
      ...snapshot.backup.habits,
      ...snapshot.backup.goals.map((goal) => ({ id: goal.id, name: goal.title })),
      ...snapshot.backup.goalSettings.statusDefinitions,
    ].map((item) => [item.id, item.name])
  );
}

export function project(
  record: Record<string, unknown>,
  collection: string,
  labels: Map<string, string>,
  options: Presentation
) {
  if (options.fields) {
    const projected: Record<string, unknown> = {};
    for (const field of options.fields) {
      if (!Object.hasOwn(record, field)) continue;
      projected[field] = record[field];
    }
    return projected;
  }
  if (options.detail === 'full') return record;
  const view = { ...record };
  for (const [key, label] of [
    ['folderId', 'folder'],
    ['activityId', 'activity'],
    ['habitId', 'habit'],
    ['goalId', 'goal'],
    ['routineId', 'routine'],
    ['statusId', 'status'],
  ] as const) {
    if (key in view) {
      view[label] =
        view[key] === null
          ? key === 'activityId'
            ? 'Idle'
            : null
          : (labels.get(String(view[key])) ?? view[key]);
      delete view[key];
    }
  }
  if (collection === 'transitions') {
    const historical = record.activitySnapshot as { name?: string } | undefined;
    view.activity = historical?.name ?? view.activity;
    for (const key of ['id', 'activitySnapshot', 'correctionOfId', 'source']) delete view[key];
    if (view.status === 'recorded') delete view.status;
  }
  if (collection === 'routine_history') {
    view.routine = (record.routineSnapshot as { name: string }).name;
    for (const key of ['id', 'routineSnapshot', 'stepSessions']) delete view[key];
  }
  return compact(view) as Record<string, unknown>;
}
