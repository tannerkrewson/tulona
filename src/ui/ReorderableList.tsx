import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, View, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { GripVertical } from 'lucide-react-native';

import { useAppTheme } from '@theme';
import { dragTarget, moveId } from './reorder';
import { useReorderScroll } from './ReorderScrollView';

interface HandleActions {
  disabled: boolean;
  start: (y: number) => void;
  move: (distance: number, y: number) => void;
  finish: (success: boolean) => void;
  step: (direction: -1 | 1) => void;
  canUp: boolean;
  canDown: boolean;
  position: number;
  count: number;
}
const HandleContext = createContext<HandleActions | null>(null);

export function DragHandle({
  disabled = false,
  label = 'Reorder row',
  testID,
}: {
  disabled?: boolean;
  label?: string;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const actions = useContext(HandleContext);
  const enabled = Boolean(actions && !actions.disabled && !disabled);
  const start = (y: number) => actions?.start(y);
  const move = (distance: number, y: number) => actions?.move(distance, y);
  const finish = (success: boolean) => actions?.finish(success);
  const pan = usePanGesture({
    enabled,
    minDistance: 1,
    onActivate: (event) => {
      'worklet';
      scheduleOnRN(start, event.absoluteY);
      scheduleOnRN(move, event.translationY, event.absoluteY);
    },
    onUpdate: (event) => {
      'worklet';
      scheduleOnRN(move, event.translationY, event.absoluteY);
    },
    onDeactivate: (event) => {
      'worklet';
      scheduleOnRN(finish, !event.canceled);
    },
  });
  return (
    <GestureDetector gesture={pan} touchAction="none">
      <Pressable
        onPress={(event) => event.stopPropagation()}
        accessible
        accessibilityHint="Drag up or down to rearrange. Use move actions or arrow keys to move one row."
        accessibilityLabel={label}
        accessibilityRole="adjustable"
        accessibilityState={{ disabled: !enabled }}
        accessibilityValue={{
          min: 1,
          max: actions?.count ?? 1,
          now: actions?.position ?? 1,
          text: `Position ${actions?.position ?? 1} of ${actions?.count ?? 1}`,
        }}
        aria-valuemin={1}
        aria-valuemax={actions?.count ?? 1}
        aria-valuenow={actions?.position ?? 1}
        aria-valuetext={`Position ${actions?.position ?? 1} of ${actions?.count ?? 1}`}
        accessibilityActions={[
          ...(actions?.canUp ? [{ name: 'decrement', label: 'Move up' }] : []),
          ...(actions?.canDown ? [{ name: 'increment', label: 'Move down' }] : []),
        ]}
        onAccessibilityAction={(event) => {
          if (enabled) actions?.step(event.nativeEvent.actionName === 'decrement' ? -1 : 1);
        }}
        {...(Platform.OS === 'web'
          ? {
              tabIndex: enabled ? 0 : -1,
              onKeyDown: (event: {
                key: string;
                preventDefault: () => void;
                stopPropagation: () => void;
              }) => {
                if (enabled && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                  event.preventDefault();
                  event.stopPropagation();
                  actions?.step(event.key === 'ArrowUp' ? -1 : 1);
                }
              },
            }
          : {})}
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          height: 44,
          width: 36,
          opacity: enabled ? 1 : 0.35,
          ...(Platform.OS === 'web'
            ? ({
                cursor: enabled ? 'grab' : 'default',
                touchAction: 'none',
                userSelect: 'none',
              } as unknown as ViewStyle)
            : {}),
        }}
        testID={testID}
      >
        <GripVertical color={colors.textMuted} size={22} />
      </Pressable>
    </GestureDetector>
  );
}

interface DragState {
  height: number;
  ids: string[];
  id: string;
  from: number;
  target: number;
  distance: number;
}

/** Keeps rows mounted while dragging; commits one ordered ID list on drop. */
export function ReorderableList<T>({
  items,
  getId,
  renderItem,
  onReorder,
  enabled = true,
  gap = 0,
  testID,
}: {
  items: readonly T[];
  getId: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onReorder: (ids: string[]) => Promise<unknown> | void;
  enabled?: boolean;
  gap?: number;
  testID?: string;
}) {
  const scroll = useReorderScroll();
  const [drag, setDrag] = useState<DragState | null>(null);
  const currentDrag = useRef<DragState | null>(null);
  const layouts = useRef(new Map<string, { y: number; height: number }>());
  const [pending, setPending] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(true);
  const session = useRef({
    startScroll: 0,
    distance: 0,
    pointerY: 0,
    bounds: null as { top: number; bottom: number } | null,
  });
  const ids = items.map(getId);
  const displayedIds =
    pending && pending.length === ids.length && pending.every((id) => ids.includes(id))
      ? pending
      : ids;
  const byId = new Map(items.map((item) => [getId(item), item]));
  const clear = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    scroll?.lock(false);
    currentDrag.current = null;
    if (mounted.current) setDrag(null);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearInterval(timer.current);
      scroll?.lock(false);
    };
  }, [scroll]);
  useEffect(() => {
    if (!enabled || (currentDrag.current && currentDrag.current.ids.join() !== ids.join())) clear();
  });

  const commit = async (next: string[]) => {
    if (saving || !enabled || next.every((id, i) => id === ids[i])) return;
    setPending(next);
    setSaving(true);
    try {
      await onReorder(next);
    } finally {
      if (mounted.current) {
        setPending(null);
        setSaving(false);
      }
    }
  };
  const finish = (success: boolean) => {
    const state = currentDrag.current;
    clear();
    if (success && state)
      void commit(moveId(displayedIds, state.from, state.target)).catch(() => undefined);
  };
  return (
    <View style={{ gap, width: '100%' }} testID={testID}>
      {displayedIds.map((id, index) => {
        const item = byId.get(id)!;
        const update = () => {
          const state = currentDrag.current;
          if (!state || state.id !== id) return;
          const traveled =
            session.current.distance + (scroll?.offset() ?? 0) - session.current.startScroll;
          const centers = displayedIds.map((rowId) => {
            const layout = layouts.current.get(rowId);
            return layout ? layout.y + layout.height / 2 : 0;
          });
          const next = {
            ...state,
            distance: traveled,
            target: dragTarget(centers, state.from, traveled),
          };
          currentDrag.current = next;
          setDrag(next);
        };
        const actions: HandleActions = {
          disabled: !enabled || saving || items.length < 2,
          position: index + 1,
          count: displayedIds.length,
          canUp: index > 0,
          canDown: index < displayedIds.length - 1,
          start: (y) => {
            session.current = {
              startScroll: scroll?.offset() ?? 0,
              distance: 0,
              pointerY: y,
              bounds: null,
            };
            scroll?.lock(true);
            scroll?.measure((top, bottom) => {
              if (currentDrag.current?.id === id) session.current.bounds = { top, bottom };
            });
            const state = {
              id,
              from: index,
              target: index,
              distance: 0,
              height: layouts.current.get(id)?.height ?? 0,
              ids: displayedIds,
            };
            currentDrag.current = state;
            setDrag(state);
            timer.current = setInterval(() => {
              const { bounds, pointerY } = session.current;
              if (!bounds || !scroll) return;
              const amount =
                pointerY < bounds.top + 56 ? -8 : pointerY > bounds.bottom - 56 ? 8 : 0;
              if (amount) {
                scroll.scrollBy(amount);
                update();
              }
            }, 16);
          },
          move: (dy, y) => {
            session.current.distance = dy;
            session.current.pointerY = y;
            update();
          },
          finish,
          step: (direction) => {
            void commit(moveId(displayedIds, index, index + direction)).catch(() => undefined);
          },
        };
        let translateY = 0;
        if (drag) {
          if (drag.id === id) translateY = drag.distance;
          else if (index > drag.from && index <= drag.target) translateY = -drag.height - gap;
          else if (index < drag.from && index >= drag.target) translateY = drag.height + gap;
        }
        return (
          <HandleContext.Provider key={id} value={actions}>
            <View
              onLayout={(event) => layouts.current.set(id, event.nativeEvent.layout)}
              style={{
                width: '100%',
                zIndex: drag?.id === id ? 100 : 0,
                transform: [{ translateY }],
                opacity: drag?.id === id ? 0.88 : 1,
              }}
            >
              {renderItem(item, index)}
            </View>
          </HandleContext.Provider>
        );
      })}
    </View>
  );
}
