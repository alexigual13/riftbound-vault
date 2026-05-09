import { createSupabaseServerClient } from './supabase/server'

/**
 * Returns the user id to scope queries by.
 *
 *  - When auth is enabled (`NEXT_PUBLIC_REQUIRE_AUTH=true`) and a session
 *    exists, returns the Supabase user id.
 *  - Otherwise, returns `DEFAULT_USER_ID` (single-user / local dev mode).
 *
 * This dual-mode is intentional: it lets you boot the app without setting up
 * Supabase Auth (handy for development) and lets you turn on real auth with
 * a single env var when you go multi-device.
 */
export async function getUserId(): Promise<string> {
  if (process.env.NEXT_PUBLIC_REQUIRE_AUTH === 'true') {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) throw new Error('Unauthenticated')
    return data.user.id
  }
  return process.env.DEFAULT_USER_ID || 'local-user'
}

export async function getSessionUser() {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  return data.user
}
