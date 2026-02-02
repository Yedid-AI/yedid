/**
 * One-time migration script: create auth.users entries for existing public.users
 * and link them via the auth_id bridge column.
 *
 * Prerequisites:
 *   1. Run migration 007_supabase_auth.sql first
 *   2. Ensure GoTrue is running on your self-hosted Supabase
 *
 * Usage:
 *   node scripts/migrate-users-to-supabase-auth.js
 *
 * After running successfully:
 *   - All users can login with their existing passwords
 *   - Verify: SELECT count(*) FROM users WHERE auth_id IS NULL; → should be 0
 *   - Then deploy the new auth code
 */
import 'dotenv/config'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function migrate() {
  // Fetch all users that don't have an auth_id yet
  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, email, password_hash, first_name, last_name')
    .is('auth_id', null)
    .order('id', { ascending: true })

  if (error) {
    console.error('Failed to fetch users:', error.message)
    process.exit(1)
  }

  if (!users || users.length === 0) {
    console.log('No users to migrate (all have auth_id set).')
    return
  }

  console.log(`Found ${users.length} user(s) to migrate.\n`)

  let success = 0
  let failed = 0

  for (const user of users) {
    try {
      // 1. Create user in auth.users via GoTrue admin API
      const tempPassword = crypto.randomUUID()
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          first_name: user.first_name,
          last_name: user.last_name,
        },
      })

      if (authError) {
        // If user already exists in auth.users, try to find them
        if (authError.message.includes('already been registered')) {
          const { data: { users: existingAuthUsers } } = await supabaseAdmin.auth.admin.listUsers()
          const existing = existingAuthUsers?.find(u => u.email === user.email)
          if (existing) {
            // Link existing auth user
            await supabaseAdmin
              .from('users')
              .update({ auth_id: existing.id })
              .eq('id', user.id)
            console.log(`  Linked existing auth user: ${user.email} → ${existing.id}`)
            success++
            continue
          }
        }
        throw authError
      }

      const authUserId = authData.user.id

      // 2. Copy the existing bcrypt hash to auth.users.encrypted_password
      if (user.password_hash) {
        const { error: rpcError } = await supabaseAdmin.rpc('update_auth_password', {
          target_user_id: authUserId,
          hashed_password: user.password_hash,
        })

        if (rpcError) {
          console.warn(`  Warning: could not copy password hash for ${user.email}: ${rpcError.message}`)
          console.warn(`  User will need to reset their password.`)
        }
      }

      // 3. Update public.users with the auth_id bridge
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ auth_id: authUserId })
        .eq('id', user.id)

      if (updateError) {
        // Rollback: delete the auth user we just created
        await supabaseAdmin.auth.admin.deleteUser(authUserId)
        throw updateError
      }

      console.log(`  Migrated: ${user.email} → ${authUserId}`)
      success++
    } catch (err) {
      console.error(`  FAILED: ${user.email} — ${err.message}`)
      failed++
    }
  }

  console.log(`\nMigration complete: ${success} success, ${failed} failed`)

  // Verify
  const { count } = await supabaseAdmin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .is('auth_id', null)

  if (count > 0) {
    console.warn(`\nWarning: ${count} user(s) still have no auth_id. Re-run the script or fix manually.`)
  } else {
    console.log('\nAll users have auth_id set. Ready to deploy new auth code.')
  }
}

migrate().catch((err) => {
  console.error('Migration error:', err)
  process.exit(1)
})
