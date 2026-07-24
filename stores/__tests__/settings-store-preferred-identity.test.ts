import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, migrateSettings } from '../settings-store';

describe('settings-store per-account preferredIdentityIds (issue #507)', () => {
  beforeEach(() => {
    useSettingsStore.setState({ preferredIdentityIds: {} });
  });

  it('defaults to an empty record (no account has a synced default)', () => {
    expect(useSettingsStore.getState().preferredIdentityIds).toEqual({});
  });

  it('keeps each account default independent', () => {
    useSettingsStore.setState({
      preferredIdentityIds: { 'acct-1': 'b', 'acct-2': 'c' },
    });
    const map = useSettingsStore.getState().preferredIdentityIds;
    expect(map['acct-1']).toBe('b');
    expect(map['acct-2']).toBe('c');
    expect(map['acct-3']).toBeUndefined();
  });

  it('round-trips through export -> import so the choice survives clearing site data', () => {
    useSettingsStore.setState({ preferredIdentityIds: { 'acct-1': 'b' } });
    const json = useSettingsStore.getState().exportSettings();
    // Appears in exported JSON (issue #507 acceptance criterion).
    expect(JSON.parse(json).preferredIdentityIds).toEqual({ 'acct-1': 'b' });

    // Simulate a fresh browser: clear, then import the exported settings.
    useSettingsStore.setState({ preferredIdentityIds: {} });
    expect(useSettingsStore.getState().importSettings(json)).toBe(true);
    expect(useSettingsStore.getState().preferredIdentityIds).toEqual({ 'acct-1': 'b' });
  });

  describe('importSettings non-record guard', () => {
    it('ignores a legacy array shape', () => {
      useSettingsStore.setState({ preferredIdentityIds: { 'acct-1': 'b' } });
      const ok = useSettingsStore.getState().importSettings(
        JSON.stringify({ preferredIdentityIds: ['b'] }),
      );
      expect(ok).toBe(true);
      expect(useSettingsStore.getState().preferredIdentityIds).toEqual({ 'acct-1': 'b' });
    });

    it('ignores a null value', () => {
      useSettingsStore.setState({ preferredIdentityIds: { 'acct-1': 'b' } });
      useSettingsStore.getState().importSettings(JSON.stringify({ preferredIdentityIds: null }));
      expect(useSettingsStore.getState().preferredIdentityIds).toEqual({ 'acct-1': 'b' });
    });

    it('accepts a proper per-account record', () => {
      useSettingsStore.getState().importSettings(
        JSON.stringify({ preferredIdentityIds: { 'acct-9': 'a' } }),
      );
      expect(useSettingsStore.getState().preferredIdentityIds).toEqual({ 'acct-9': 'a' });
    });
  });

  describe('migrateSettings identity map', () => {
    it('adds an empty preferredIdentityIds map for pre-v6 users', () => {
      const out = migrateSettings({ allMailFolderIds: {} }, 6) as unknown as Record<string, unknown>;
      expect(out.preferredIdentityIds).toEqual({});
    });

    it('coerces a non-record preferredIdentityIds to an empty map', () => {
      const out = migrateSettings(
        { allMailFolderIds: {}, preferredIdentityIds: ['b'] },
        7,
      ) as unknown as Record<string, unknown>;
      expect(out.preferredIdentityIds).toEqual({});
    });

    it('preserves a valid per-account map across migration', () => {
      const out = migrateSettings(
        { allMailFolderIds: {}, preferredIdentityIds: { 'acct-1': 'b' } },
        7,
      ) as unknown as Record<string, unknown>;
      expect(out.preferredIdentityIds).toEqual({ 'acct-1': 'b' });
    });
  });
});
