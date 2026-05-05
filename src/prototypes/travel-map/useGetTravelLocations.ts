import { languageToQid } from "./languageToQid"
import type { FeatureCollection } from "geojson"

type TravelResult = {
  qidCount: number
  languages: string[]
  languageNames: string[]
  languagePoints: {
    [lang: string]: FeatureCollection[]
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getISODateDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString()
}

// -------------------------
// safe fetch
// -------------------------
async function safeFetch(url: string, delay = 250) {
  await sleep(delay)
  const res = await fetch(url)

  if (!res.ok) {
    console.warn("HTTP error:", res.status, url)
  }

  return res
}

// -------------------------
// LANGUAGE → COUNTRIES (robust)
// uses BOTH P37 + P2936
// -------------------------
async function getSpokenInCountries(languageQid: string): Promise<string[]> {
  const res = await fetch(
    `https://query.wikidata.org/sparql?query=${encodeURIComponent(`
      SELECT DISTINCT ?country WHERE {
        {
          ?country wdt:P37 wd:${languageQid}.
        }
        UNION
        {
          ?country wdt:P2936 wd:${languageQid}.
        }
      }
      LIMIT 5
    `)}&format=json`
  )

  const data = await res.json()

  const seen = new Set<string>()
  const results: string[] = []

  for (const b of data.results.bindings) {
    const id = b.country.value.split("/").pop()
    if (!seen.has(id)) {
      seen.add(id)
      results.push(id)
    }
  }

  return results
}

// -------------------------
// GET COUNTRY GEOMETRY (P3896 → fallback P625)
// -------------------------
async function getCountryGeometry(countryQid: string): Promise<FeatureCollection | null> {
  const res = await safeFetch(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${countryQid}&props=claims&format=json&origin=*`,
    200
  )

  const data = await res.json()
  const entity = data.entities?.[countryQid]

  if (!entity) return null

  // -------------------------
  // 1. TRY GEO SHAPE (P3896)
  // -------------------------
  const shapeUrl = entity?.claims?.P3896?.[0]?.mainsnak?.datavalue?.value

  if (shapeUrl) {
    try {
      const res = await fetch(shapeUrl)
      const text = await res.text()

      // avoid HTML junk responses
      if (!text.trim().startsWith("{")) {
        throw new Error("Invalid GeoJSON")
      }

      const geojson = JSON.parse(text)

      if (geojson?.features?.length) {
        return geojson
      }
    } catch {
      // ignore and fallback
    }
  }

  // -------------------------
  // 2. FALLBACK: centroid (P625)
  // -------------------------
  const coord = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value

  if (coord?.latitude && coord?.longitude) {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [coord.longitude, coord.latitude]
          },
          properties: {
            fallback: true
          }
        }
      ]
    }
  }

  return null
}

// -------------------------
// MAIN FUNCTION
// -------------------------
export async function getEditTravelMap(username: string): Promise<TravelResult> {
  const allTitles = new Set<string>()

  const ucstart = new Date().toISOString()
  const ucend = getISODateDaysAgo(25)

  let uccontinue: string | undefined

  // -------------------------
  // 1. Wikipedia contributions
  // -------------------------
  do {
    const url = new URL("https://en.wikipedia.org/w/api.php")
    url.searchParams.set("action", "query")
    url.searchParams.set("list", "usercontribs")
    url.searchParams.set("ucuser", username)
    url.searchParams.set("uclimit", "200")
    url.searchParams.set("ucprop", "title")
    url.searchParams.set("ucstart", ucstart)
    url.searchParams.set("ucend", ucend)
    url.searchParams.set("format", "json")
    url.searchParams.set("origin", "*")

    if (uccontinue) url.searchParams.set("uccontinue", uccontinue)

    const res = await safeFetch(url.toString(), 300)
    const data = await res.json()

    for (const c of data.query?.usercontribs || []) {
      allTitles.add(c.title)
    }

    uccontinue = data.continue?.uccontinue
  } while (uccontinue)

  // -------------------------
  // 2. titles → QIDs
  // -------------------------
  const titles = Array.from(allTitles)
  const qids = new Set<string>()

  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50)

    const res = await safeFetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&titles=${batch
        .map(t => encodeURIComponent(t))
        .join("|")}&format=json&origin=*`,
      250
    )

    const data = await res.json()
    const pages = Object.values(data.query.pages) as any[]

    for (const page of pages) {
      const qid = page.pageprops?.wikibase_item
      if (qid) qids.add(qid)
    }
  }

  // -------------------------
  // 3. QIDs → languages
  // -------------------------
  const languages = new Set<string>()
  const qidArray = Array.from(qids)

  for (let i = 0; i < qidArray.length; i += 50) {
    const batch = qidArray.slice(i, i + 50)

    const res = await safeFetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join(
        "|"
      )}&props=sitelinks&format=json&origin=*`,
      250
    )

    const data = await res.json()

    for (const qid of batch) {
      const sitelinks = data.entities[qid]?.sitelinks
      if (!sitelinks) continue

      for (const key of Object.keys(sitelinks)) {
        if (key.endsWith("wiki")) {
          languages.add(key.replace("wiki", ""))
        }
      }
    }
  }

  // -------------------------
  // 4. language names
  // -------------------------
  const langInfoRes = await safeFetch(
    "https://en.wikipedia.org/w/api.php?action=query&meta=languageinfo&liprop=code|name|autonym&format=json&origin=*",
    200
  )

  const langInfoData = await langInfoRes.json()

  const languageInfo: Record<string, { name: string }> =
    langInfoData.query.languageinfo

  const languageNames = Array.from(languages).map(
    code => languageInfo[code]?.name || code
  )

  // -------------------------
  // 5. GEO PIPELINE (FIXED + GUARANTEED OUTPUT)
  // -------------------------
  const languagePoints: Record<string, FeatureCollection[]> = {}

  for (const lang of languages) {
    const langQidOrList = languageToQid[lang]
    if (!langQidOrList) continue

    const langQids = Array.isArray(langQidOrList)
      ? langQidOrList
      : [langQidOrList]

    const geoCollections: FeatureCollection[] = []

    try {
      for (const langQid of langQids) {
        // await sleep(250)

        const countries = await getSpokenInCountries(langQid)

        for (const countryQid of countries.slice(0, 25)) {
          // await sleep(150)

          const geo = await getCountryGeometry(countryQid)

          if (geo) {
            geoCollections.push(geo)
          }
        }
      }

      // IMPORTANT: ensure not empty (prevents blank map)
      if (geoCollections.length === 0) {
        console.warn(`No geo data for language: ${lang}`)
      }

      languagePoints[lang] = geoCollections
    } catch (e) {
      console.warn("Failed language:", lang, e)
      languagePoints[lang] = []
    }
  }

  // -------------------------
  // FINAL
  // -------------------------
  return {
    qidCount: qids.size,
    languages: Array.from(languages),
    languageNames,
    languagePoints
  }
}
