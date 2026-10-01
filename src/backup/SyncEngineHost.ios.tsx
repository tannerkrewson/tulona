import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState, LogBox, StyleSheet, View } from 'react-native';

import { HostedSyncEngineClient } from './hosted-sync-engine';
import { registerHostedSyncRuntime } from './sync-engine';
import SyncEngineWebView, { type SyncEngineWebViewRef } from './SyncEngineWebView';

const client = new HostedSyncEngineClient();

// Expo's DOM wrapper pushes props before the native WebView registers, rejecting once per mount.
LogBox.ignoreLogs([/Unable to find the 'DomWebView' view with tag/]);

registerHostedSyncRuntime({
  transport: client.transport,
  subscribeToForeground: (listener) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') listener();
    });
    return () => subscription.remove();
  },
});

const subscribeToDemand = (listener: () => void) => client.subscribeToDemand(listener);
const isDemanded = () => client.isDemanded;

/** Hermes has no WebAssembly, so Automerge runs in a hidden WebView once sync needs it. */
export function SyncEngineHost() {
  const active = useSyncExternalStore(subscribeToDemand, isDemanded);
  useEffect(() => () => client.detach(), []);
  return active ? <SyncEngineWebViewHost /> : null;
}

function SyncEngineWebViewHost() {
  const ref = useRef<SyncEngineWebViewRef>(null);
  const onReady = useCallback(async (instance: string) => {
    client.attach(instance, (message) => {
      if (!ref.current) throw new Error('The synchronization engine is not mounted.');
      ref.current.request(message);
    });
  }, []);
  const onResponse = useCallback(async (message: string) => client.receive(message), []);

  return (
    <View pointerEvents="none" style={styles.host}>
      <SyncEngineWebView
        dom={{ scrollEnabled: false, style: styles.webView }}
        onReady={onReady}
        onResponse={onResponse}
        ref={ref}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { height: 1, left: 0, opacity: 0, position: 'absolute', top: 0, width: 1 },
  webView: { backgroundColor: 'transparent', height: 1, width: 1 },
});
