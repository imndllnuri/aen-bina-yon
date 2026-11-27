import { describe, expect, it } from 'vitest'
import { mapsUrl } from './maps'

describe('mapsUrl', () => {
  it('searches the address, with everything unsafe encoded', () => {
    expect(mapsUrl('Atatürk Cad. No:5 Melikgazi/Kayseri')).toBe('https://www.google.com/maps/search/?api=1&query=Atat%C3%BCrk%20Cad.%20No%3A5%20Melikgazi%2FKayseri')
    expect(mapsUrl('a&b=c#d')).toBe('https://www.google.com/maps/search/?api=1&query=a%26b%3Dc%23d')
  })
})
