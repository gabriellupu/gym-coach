'use client';
import { useCallback, useEffect, useState } from 'react';
import { defaultProfile, loadProfile, saveProfile, type Profile } from '../domain/profile';

/** The stored profile. `ready` is false during prerender / first paint, before localStorage is read. */
export function useProfile() {
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setProfile(loadProfile());
    setReady(true);
  }, []);
  const update = useCallback((fn: (p: Profile) => void) => {
    setProfile((old) => {
      const next = structuredClone(old);
      fn(next);
      saveProfile(next);
      return next;
    });
  }, []);
  return { profile, update, ready, reload: () => setProfile(loadProfile()) };
}
