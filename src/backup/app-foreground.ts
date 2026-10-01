/** Browsers resume synchronization from document visibility instead. */
export const subscribeToAppForeground: ((listener: () => void) => () => void) | undefined =
  undefined;
