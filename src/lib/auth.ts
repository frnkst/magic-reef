import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_AUTH_SUPABASE_URL;
const key = import.meta.env.VITE_AUTH_SUPABASE_PUBLISHABLE_KEY;
const auth = url && key ? createClient(url, key, {
  auth: { flowType: 'pkce', storageKey: 'magic-reef-owner-session' },
}) : null;

export async function ownerRequest(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...await ownerHeaders(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
      ? result.error : 'The owner action failed. Please try again.');
  }
  return result;
}

export async function ownerHeaders() {
  if (!auth) throw new Error('GitHub owner login is not configured.');
  const { data, error } = await auth.auth.getSession();
  if (error) throw new Error(`Could not read your login: ${error.message}`);
  if (!data.session) throw new Error('Sign in with the aquarium owner’s GitHub account first.');
  return { Authorization: `Bearer ${data.session.access_token}` };
}

export function useOwner() {
  const [allowed, setAllowed] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(Boolean(auth));
  const [error, setError] = useState('');
  useEffect(() => {
    if (!auth) return;
    let active = true;
    let revision = 0;
    const check = async (signedIn: boolean) => {
      const current = ++revision;
      setLoading(true);
      if (!signedIn) setAllowed(false);
      try {
        if (signedIn) {
          const result = await ownerRequest('/api/owner');
          if (!result || typeof result !== 'object' || !('allowed' in result) || result.allowed !== true) {
            throw new Error('The server returned an invalid login check.');
          }
        }
        if (active && current === revision) {
          setAllowed(signedIn);
          const callbackError = new URLSearchParams(window.location.hash.slice(1)).get('error_description')
            || new URLSearchParams(window.location.search).get('error_description');
          setError(signedIn ? '' : (callbackError ?? '').slice(0, 300));
        }
      } catch (cause) {
        if (active && current === revision) {
          setAllowed(false);
          setError(cause instanceof Error ? cause.message : 'Could not verify owner login.');
        }
      } finally {
        if (active && current === revision) setLoading(false);
      }
    };
    const { data } = auth.auth.onAuthStateChange((_event, session) => {
      // Supabase auth callbacks must return before making another auth request.
      window.setTimeout(() => {
        if (active) { setSignedIn(Boolean(session)); void check(Boolean(session)); }
      }, 0);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  const signIn = async () => {
    setError('');
    if (!auth) { setError('GitHub owner login is not configured.'); return; }
    const redirect = new URL(window.location.href);
    redirect.hash = '';
    redirect.searchParams.delete('code');
    try {
      const { error } = await auth.auth.signInWithOAuth({
        provider: 'github', options: { redirectTo: redirect.toString(), scopes: 'read:user' },
      });
      if (error) throw error;
    } catch (cause) {
      setError(`Could not sign in: ${cause instanceof Error ? cause.message : 'Check your connection and try again.'}`);
    }
  };
  const signOut = async () => {
    if (!auth) return;
    try {
      const { error } = await auth.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setAllowed(false);
      setSignedIn(false);
    } catch (cause) {
      setError(`Could not sign out: ${cause instanceof Error ? cause.message : 'Check your connection and try again.'}`);
    }
  };
  return { allowed, signedIn, loading, error, signIn, signOut };
}

export type OwnerAccess = ReturnType<typeof useOwner>;
