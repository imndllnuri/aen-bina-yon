import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAdmins, removeAdmin } from './api'

const client = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: client }))
beforeEach(() => {
  client.rpc.mockReset()
})

describe('fetchAdmins', () => {
  it('asks for the admins of one site and reads each row', async () => {
    client.rpc.mockResolvedValue({
      data: [{ profile_id: 'p1', full_name: 'Ayşe Admin', email: 'a@b.com', phone: '0532', is_active: true, kvkk_consent_at: '2026-11-12T08:00:00Z', since: '2026-11-01T08:00:00Z', is_self: true }],
      error: null,
    })
    expect(await fetchAdmins('s1')).toEqual([
      { profileId: 'p1', fullName: 'Ayşe Admin', email: 'a@b.com', phone: '0532', isActive: true, activatedAt: '2026-11-12T08:00:00Z', since: '2026-11-01T08:00:00Z', isSelf: true },
    ])
    expect(client.rpc).toHaveBeenCalledWith('list_site_admins', { p_site: 's1' })
  })
  it('keeps "not yet activated" (no consent date) as null', async () => {
    client.rpc.mockResolvedValue({ data: [{ profile_id: 'p2', full_name: null, email: 'x@y.com', phone: null, is_active: true, kvkk_consent_at: null, since: '2026-11-01T08:00:00Z', is_self: false }], error: null })
    const [row] = await fetchAdmins('s1')
    expect(row).toMatchObject({ activatedAt: null, fullName: null, phone: null, isSelf: false })
  })
  it('throws what the database says', async () => {
    client.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not allowed' } })
    await expect(fetchAdmins('s1')).rejects.toMatchObject({ code: '42501' })
  })
})

describe('removeAdmin', () => {
  it('calls the checked function with the site and the person', async () => {
    client.rpc.mockResolvedValue({ data: null, error: null })
    await removeAdmin('s1', 'p2')
    expect(client.rpc).toHaveBeenCalledWith('remove_site_admin', { p_site: 's1', p_profile: 'p2' })
  })
  it('throws what the database says (for example: you cannot remove yourself)', async () => {
    client.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'cannot_remove_self' } })
    await expect(removeAdmin('s1', 'p1')).rejects.toMatchObject({ message: 'cannot_remove_self' })
  })
})
