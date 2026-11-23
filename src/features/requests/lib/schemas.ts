import { z } from 'zod'
import { CATEGORY_CODES, PRIORITY_CODES } from './catalog'

// The fields of a request, with the same limits as the database (migration 0008). Messages are Turkish.
export const requestSchema = z.object({
  category: z.enum(CATEGORY_CODES, { error: 'Kategori seçin.' }),
  title: z
    .string()
    .trim()
    .min(3, 'Başlık en az 3 karakter olmalı.')
    .max(120, 'Başlık en fazla 120 karakter olabilir.'),
  description: z
    .string()
    .trim()
    .min(3, 'Açıklama en az 3 karakter olmalı.')
    .max(2000, 'Açıklama en fazla 2000 karakter olabilir.'),
  priority: z.enum(PRIORITY_CODES, { error: 'Öncelik seçin.' }),
  location: z.string().trim().max(120, 'Konum en fazla 120 karakter olabilir.'),
})
export type RequestValues = z.infer<typeof requestSchema>

export const EMPTY_REQUEST: RequestValues = { category: 'diger', title: '', description: '', priority: 'normal', location: '' }

export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Yorum yazın.').max(2000, 'Yorum en fazla 2000 karakter olabilir.'),
})
export type CommentValues = z.infer<typeof commentSchema>
