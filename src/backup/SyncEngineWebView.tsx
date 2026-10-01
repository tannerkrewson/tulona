'use dom';

import { useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from 'expo/dom';
import { useEffect, useMemo, useRef, type Ref } from 'react';

import { createSyncEngineWorker, handleSyncEngineMessage } from './sync-engine-worker';

/** Each WebView load evaluates this module again, so a reload gets a new instance. */
const instance = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

type BridgeValue = Parameters<DOMImperativeFactory[string]>[number];

export interface SyncEngineWebViewRef extends DOMImperativeFactory {
  request(message: BridgeValue): void;
}

interface SyncEngineWebViewProps {
  ref?: Ref<SyncEngineWebViewRef>;
  dom?: DOMProps;
  onReady: (instance: string) => Promise<void>;
  onResponse: (message: string) => Promise<void>;
}

/** Runs Automerge where WebAssembly is available and answers requests from the app runtime. */
export default function SyncEngineWebView({ ref, onReady, onResponse }: SyncEngineWebViewProps) {
  const worker = useMemo(() => createSyncEngineWorker(), []);

  useDOMImperativeHandle(
    ref ?? null,
    () => ({
      request(message: BridgeValue) {
        if (typeof message !== 'string') return;
        void handleSyncEngineMessage(worker, message).then(onResponse);
      },
    }),
    [worker, onResponse]
  );

  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    void onReady(instance);
  }, [onReady]);

  return null;
}
