import type { Href } from 'expo-router';

interface InAppRouter {
  back(): void;
  canGoBack(): boolean;
  replace(href: Href): void;
}

/** Pops back to the tracker home, animating as a return rather than a push. */
export function goHomeInAppStack(router: { dismissTo(href: Href): void }): void {
  router.dismissTo('/');
}

/** Pops the Expo app stack, using a clear parent route when opened directly. */
export function goBackInAppStack(router: InAppRouter, fallback: Href): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
