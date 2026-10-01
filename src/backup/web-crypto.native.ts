import { digest, getRandomValues, randomUUID, type CryptoDigestAlgorithm } from 'expo-crypto';

// Hermes has no Web Crypto. The Dropbox SDK (PKCE) and Yjs (client ids) read `globalThis.crypto`
// when their modules load, so this must be imported before either.
const existing = (globalThis as { crypto?: Partial<Crypto> }).crypto;

if (!existing?.getRandomValues || !existing.randomUUID || !existing.subtle) {
  const subtle = {
    digest: (algorithm: AlgorithmIdentifier, data: BufferSource) =>
      digest(
        (typeof algorithm === 'string' ? algorithm : algorithm.name) as CryptoDigestAlgorithm,
        data
      ),
  } as SubtleCrypto;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues: existing?.getRandomValues?.bind(existing) ?? getRandomValues,
      randomUUID: existing?.randomUUID?.bind(existing) ?? randomUUID,
      subtle: existing?.subtle ?? subtle,
    },
  });
}
