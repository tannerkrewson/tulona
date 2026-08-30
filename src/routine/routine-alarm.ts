import type { AudioSource } from 'expo-audio';
import type { ActiveRoutine, AlarmSettings, UUID } from '@domain';

import {
  markRoutineAlarmFired,
  routineAlarmWasFired,
  routineTiming,
  type RoutineTimestampInput,
} from './routine-engine';

function bundledAlarmSource(): number {
  return require('../../assets/routine-alarm.wav') as number;
}

export interface RoutineAlarmPlayer {
  volume: number;
  play(): void;
  remove(): void;
}

export interface RoutineAlarmAudioAdapter {
  prepare(source: AudioSource): Promise<RoutineAlarmPlayer>;
}

export interface RoutineAlarmOptions {
  source?: AudioSource;
  audio?: RoutineAlarmAudioAdapter;
  settings?: Partial<AlarmSettings>;
  enabled?: boolean;
  volume?: number;
  leadTimeMs?: number;
}

export type RoutineAlarmResultReason =
  'not-due' | 'disabled' | 'already-fired' | 'not-prepared' | 'played' | 'playback-failed';

export interface RoutineAlarmResult {
  activeRoutine: ActiveRoutine;
  stepId: UUID | null;
  fired: boolean;
  played: boolean;
  reason: RoutineAlarmResultReason;
  error?: unknown;
}

export interface RoutineAlarmServiceApi {
  prepare(): Promise<void>;
  setEnabled(enabled: boolean): void;
  setVolume(volume: number): void;
  setSettings(settings: Partial<AlarmSettings>): void;
  foregroundResume(
    activeRoutine: ActiveRoutine,
    at?: RoutineTimestampInput
  ): Promise<RoutineAlarmResult>;
  check(activeRoutine: ActiveRoutine, at?: RoutineTimestampInput): Promise<RoutineAlarmResult>;
  dispose(): void;
}

function validateVolume(volume: number): number {
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new RangeError('Routine alarm volume must be between 0 and 1');
  }
  return volume;
}

function validateLeadTime(leadTimeMs: number): number {
  if (!Number.isInteger(leadTimeMs) || leadTimeMs < 0) {
    throw new RangeError('Routine alarm lead time must be a non-negative integer');
  }
  return leadTimeMs;
}

const expoAudioAdapter: RoutineAlarmAudioAdapter = {
  async prepare(source) {
    // Keep native audio out of pure engine imports and load it after a user gesture.
    const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
    const player = createAudioPlayer(source, { keepAudioSessionActive: false });
    return player as RoutineAlarmPlayer;
  },
};

/** Foreground-only local alarm adapter; it never schedules timers or network work. */
export class RoutineAlarmService implements RoutineAlarmServiceApi {
  private readonly source?: AudioSource;
  private readonly audio: RoutineAlarmAudioAdapter;
  private player: RoutineAlarmPlayer | null = null;
  private enabled: boolean;
  private sound: boolean;
  private volume: number;
  private leadTimeMs: number;

  constructor(options: RoutineAlarmOptions = {}) {
    this.source = options.source;
    this.audio = options.audio ?? expoAudioAdapter;
    this.enabled = options.enabled ?? options.settings?.enabled ?? false;
    this.sound = options.settings?.sound ?? true;
    this.volume = validateVolume(options.volume ?? options.settings?.volume ?? 1);
    this.leadTimeMs = validateLeadTime(options.leadTimeMs ?? options.settings?.leadTimeMs ?? 0);
  }

  async prepare(): Promise<void> {
    if (this.player) return;
    this.player = await this.audio.prepare(this.source ?? bundledAlarmSource());
    this.player.volume = this.volume;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setVolume(volume: number): void {
    this.volume = validateVolume(volume);
    if (this.player) this.player.volume = this.volume;
  }

  setSettings(settings: Partial<AlarmSettings>): void {
    if (settings.enabled !== undefined) this.setEnabled(settings.enabled);
    if (settings.sound !== undefined) this.sound = settings.sound;
    if (settings.volume !== undefined) this.setVolume(settings.volume);
    if (settings.leadTimeMs !== undefined) this.leadTimeMs = validateLeadTime(settings.leadTimeMs);
  }

  async foregroundResume(
    activeRoutine: ActiveRoutine,
    at: RoutineTimestampInput = Date.now()
  ): Promise<RoutineAlarmResult> {
    return this.check(activeRoutine, at);
  }

  async check(
    activeRoutine: ActiveRoutine,
    at: RoutineTimestampInput = Date.now()
  ): Promise<RoutineAlarmResult> {
    const timing = routineTiming(activeRoutine, at);
    const stepId = timing.stepId;
    if (!stepId || timing.deadlineAt === null || activeRoutine.status !== 'running') {
      return {
        activeRoutine,
        stepId,
        fired: false,
        played: false,
        reason: 'not-due',
      };
    }
    const nowMs = new Date(at instanceof Date ? at.getTime() : at).getTime();
    const deadlineMs = new Date(timing.deadlineAt).getTime() - this.leadTimeMs;
    if (nowMs < deadlineMs) {
      return { activeRoutine, stepId, fired: false, played: false, reason: 'not-due' };
    }
    if (routineAlarmWasFired(activeRoutine, stepId)) {
      return { activeRoutine, stepId, fired: false, played: false, reason: 'already-fired' };
    }
    if (!this.enabled || !this.sound) {
      return { activeRoutine, stepId, fired: false, played: false, reason: 'disabled' };
    }

    const marked = markRoutineAlarmFired(activeRoutine, stepId);
    if (!this.player) {
      return { activeRoutine: marked, stepId, fired: true, played: false, reason: 'not-prepared' };
    }
    try {
      this.player.volume = this.volume;
      this.player.play();
      return { activeRoutine: marked, stepId, fired: true, played: true, reason: 'played' };
    } catch (error) {
      return {
        activeRoutine: marked,
        stepId,
        fired: true,
        played: false,
        reason: 'playback-failed',
        error,
      };
    }
  }

  dispose(): void {
    this.player?.remove();
    this.player = null;
  }
}

export function createRoutineAlarmService(options?: RoutineAlarmOptions): RoutineAlarmService {
  return new RoutineAlarmService(options);
}

export const createForegroundRoutineAlarmService = createRoutineAlarmService;
