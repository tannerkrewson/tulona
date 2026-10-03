import { useState } from 'react';

import type { CatalogCollection } from '@domain';
import { confirmAction, errorText } from '@ui';
import {
  alphabetizedCatalogIds,
  reorderCatalogItems,
  type OrderDirection,
} from '../catalog/ordering';
import type { RoutineRuntime } from '../routine/routine-runtime';

/** Alphabetizing stays local until Save; persistence merges only order into the latest catalog. */
export function useCatalogOrderDraft(catalog: CatalogCollection | null, runtime: RoutineRuntime) {
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entities = catalog ? [...catalog.folders, ...catalog.activities, ...catalog.routines] : [];
  const byId = new Map(entities.map((item) => [item.id, item]));
  const currentIds = orderedIds?.filter((id) => byId.has(id)) ?? null;
  const preview = catalog && currentIds ? reorderCatalogItems(catalog, currentIds) : catalog;

  const alphabetize = async (visibleIds: readonly string[]) => {
    if (busy || !catalog) return;
    setBusy(true);
    setError(null);
    try {
      if (
        !(await confirmAction({
          title: 'Alphabetize items?',
          message:
            'Sort the items in this view by name. Items stay in their folders. Review the order, then tap Save to keep it.',
          confirmLabel: 'Alphabetize',
        }))
      )
        return;
      setOrderedIds(alphabetizedCatalogIds(catalog, visibleIds));
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const move = (id: string, direction: OrderDirection): boolean => {
    if (!currentIds || !preview) return false;
    const previewEntities = [...preview.folders, ...preview.activities, ...preview.routines];
    const item = byId.get(id);
    if (!item) return true;
    const parent = 'folderId' in item ? item.folderId : null;
    const selected = new Set(currentIds);
    const siblings = previewEntities
      .filter(
        (candidate) =>
          selected.has(candidate.id) &&
          ('folderId' in candidate ? candidate.folderId : null) === parent
      )
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const index = siblings.findIndex((candidate) => candidate.id === id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= siblings.length) return true;
    const next = [...currentIds];
    const left = next.indexOf(id);
    const right = next.indexOf(siblings[target].id);
    [next[left], next[right]] = [next[right], next[left]];
    setOrderedIds(next);
    return true;
  };

  const save = async (): Promise<boolean> => {
    if (busy) return false;
    if (!currentIds) return true;
    setBusy(true);
    setError(null);
    try {
      await runtime.catalogService.saveItemOrder(currentIds);
      await runtime.trackerStore.getState().hydrate();
      setOrderedIds(null);
      return true;
    } catch (failure) {
      setError(errorText(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    catalog: preview,
    hasDraft: orderedIds !== null,
    busy,
    error,
    alphabetize,
    move,
    save,
    cancel: () => {
      setOrderedIds(null);
      setError(null);
    },
  };
}
