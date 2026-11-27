/** A link that opens the address in a map (a plain link: the site embeds no map, so nothing is loaded from a map service until a person clicks). */
export const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
