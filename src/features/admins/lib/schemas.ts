import type { z } from 'zod'
import { inviteSchema } from '@/features/admin/lib/schemas'

// The admin invite asks for the same three facts as the resident invite (name, e-mail, phone), with the same rules.
export const adminInviteSchema = inviteSchema.pick({ fullName: true, email: true, phone: true })
export type AdminInviteValues = z.infer<typeof adminInviteSchema>
