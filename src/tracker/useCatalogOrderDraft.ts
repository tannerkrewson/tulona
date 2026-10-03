import { useState } from 'react';

import type { CatalogCollection } from '@domain';
import { confirmAction, errorText } from '@ui';
import { alphabetizedCatalogIds, reorderCatalogItems } from '../catalog/ordering';
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
    reorder: (ids: string[]) => {
      if (!preview || busy) return;
      const next = reorderCatalogItems(preview, ids);
      const selected = new Set([...(currentIds ?? []), ...ids]);
      setOrderedIds(
        [...next.folders, ...next.activities, ...next.routines]
          .filter((item) => selected.has(item.id))
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((item) => item.id)
      );
      setError(null);
    },
    save,
    cancel: () => {
      setOrderedIds(null);
      setError(null);
    },
  };
}
