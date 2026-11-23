import { describe, expect, it } from 'vitest'
import { commentSchema, EMPTY_REQUEST, requestSchema } from './schemas'

const valid = { category: 'asansor', title: 'Asansör bozuk', description: 'Üç gündür çalışmıyor', priority: 'normal', location: '' }
const messages = (value: unknown) => {
  const result = requestSchema.safeParse(value)
  return result.success ? [] : result.error.issues.map((i) => i.message)
}

describe('requestSchema', () => {
  it('accepts a good request, with or without a place', () => {
    expect(requestSchema.safeParse(valid).success).toBe(true)
    expect(requestSchema.safeParse({ ...valid, location: 'Zemin kat' }).success).toBe(true)
  })

  it('has the same limits as the database (title 3-120, text 3-2000, place 120)', () => {
    expect(requestSchema.safeParse({ ...valid, title: 'abc' }).success).toBe(true)
    expect(messages({ ...valid, title: 'ab' })).toEqual(['Başlık en az 3 karakter olmalı.'])
    expect(requestSchema.safeParse({ ...valid, title: 'a'.repeat(120) }).success).toBe(true)
    expect(messages({ ...valid, title: 'a'.repeat(121) })).toEqual(['Başlık en fazla 120 karakter olabilir.'])
    expect(messages({ ...valid, description: 'ab' })).toEqual(['Açıklama en az 3 karakter olmalı.'])
    expect(requestSchema.safeParse({ ...valid, description: 'a'.repeat(2000) }).success).toBe(true)
    expect(messages({ ...valid, description: 'a'.repeat(2001) })).toEqual(['Açıklama en fazla 2000 karakter olabilir.'])
    expect(requestSchema.safeParse({ ...valid, location: 'a'.repeat(120) }).success).toBe(true)
    expect(messages({ ...valid, location: 'a'.repeat(121) })).toEqual(['Konum en fazla 120 karakter olabilir.'])
  })

  it('does not count spaces (the database trims too)', () => {
    expect(messages({ ...valid, title: '   ab   ' })).toEqual(['Başlık en az 3 karakter olmalı.'])
    expect(requestSchema.parse({ ...valid, title: '  Asansör  ' }).title).toBe('Asansör')
  })

  it('refuses a category or priority that does not exist', () => {
    expect(messages({ ...valid, category: 'uzay' })).toEqual(['Kategori seçin.'])
    expect(messages({ ...valid, priority: 'hemen' })).toEqual(['Öncelik seçin.'])
    expect(messages({ ...valid, category: undefined })).toEqual(['Kategori seçin.'])
  })

  it('starts the form with the plain choices', () => {
    expect(EMPTY_REQUEST).toMatchObject({ category: 'diger', priority: 'normal', title: '', description: '', location: '' })
  })
})

describe('commentSchema', () => {
  it('wants 1 to 2000 letters', () => {
    expect(commentSchema.safeParse({ body: 'a' }).success).toBe(true)
    expect(commentSchema.safeParse({ body: 'a'.repeat(2000) }).success).toBe(true)
    expect(commentSchema.safeParse({ body: '   ' }).success).toBe(false)
    expect(commentSchema.safeParse({ body: 'a'.repeat(2001) }).success).toBe(false)
  })
})
