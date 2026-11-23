import { createRequest, uploadRequestPhoto } from './api'
import { photoPath } from './lib/photo'
import type { RequestValues } from './lib/schemas'
import type { PickedPhoto } from './components/PhotoPicker'

/**
 * Open a request: 1) each photo goes into the private bucket (only into this unit's folder), 2) the database makes the request
 * and attaches the photos. A retry after a lost answer is safe: the photo names and the token are the same.
 * `requesterId` is null for a resident (the database uses the caller); an admin passes the resident the request is for.
 */
export async function openRequest(input: { token: string; unitId: string; requesterId: string | null; values: RequestValues; photos: PickedPhoto[] }): Promise<string> {
  const photoPaths: string[] = []
  for (const photo of input.photos) {
    const path = photoPath(input.unitId, photo.id, photo.type)
    await uploadRequestPhoto(path, photo)
    photoPaths.push(path)
  }
  return createRequest({
    token: input.token,
    unitId: input.unitId,
    requesterId: input.requesterId,
    photoPaths,
    category: input.values.category,
    title: input.values.title,
    description: input.values.description,
    priority: input.values.priority,
    location: input.values.location === '' ? null : input.values.location,
  })
}

/** The request id (token) must change when the content changes: so the key depends on the exact payload, photos included. */
export const tokenPayload = (unitId: string, requesterId: string | null, values: RequestValues, photos: PickedPhoto[]) => ({ unitId, requesterId, values, photos: photos.map((p) => p.id) })
