import { languageToQid } from "./languageToQid"
import type { FeatureCollection, Feature } from "geojson"

type EnrichedFeature = Feature & {
  properties: {
    title: string
    pageviews: number | null
    editedAt: string
    qid?: string
  }
}

type TravelResult = {
  qidCount: number
  languages: string[]
  languageNames: string[]
  languagePoints: Record<
    string,
    FeatureCollection & { features: EnrichedFeature[] }
  >
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function safeFetch(url: string, delay = 600) {
  await sleep(delay)
  const res = await fetch(url)
  if (!res.ok) console.warn("HTTP error:", res.status, url)
  return res
}

function getISODateDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString()
}

function getCache<T>(key: string): T | null {
  try {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function setCache(key: string, value: any) {
  try {
    if (typeof window === "undefined") return
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

async function getPageViewsSince(title: string, startDateISO: string) {
  try {
    const encoded = encodeURIComponent(title.replace(/ /g, "_"))

    const format = (d: Date) =>
      d.toISOString().split("T")[0].replace(/-/g, "")

    const start = new Date(startDateISO)
    const end = new Date()

    const url =
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/` +
      `en.wikipedia/all-access/user/${encoded}/daily/${format(start)}/${format(end)}`

    const res = await fetch(url)
    if (!res.ok) return null

    const data = await res.json()

    return (
      data.items?.reduce((sum: number, i: any) => sum + (i.views || 0), 0) ??
      null
    )
  } catch {
    return null
  }
}

async function getQidsFromTitle(title: string): Promise<string[]> {
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(
      title
    )}&format=json&origin=*`
  )

  const data = await res.json()
  const pages = Object.values(data.query.pages || {}) as any[]

  return pages
    .map(p => p.pageprops?.wikibase_item)
    .filter(Boolean)
}

async function getSitelinkLanguages(qid: string): Promise<string[]> {
  const res = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks&format=json&origin=*`
  )

  const data = await res.json()
  const sitelinks = data.entities?.[qid]?.sitelinks
  if (!sitelinks) return []

  return Object.keys(sitelinks)
    .filter(k => k.endsWith("wiki"))
    .map(k => k.replace("wiki", ""))
}

// country geo
async function getCountryGeometry(qid: string): Promise<FeatureCollection | null> {
  const cacheKey = `country:${qid}`
  const cached = getCache<FeatureCollection>(cacheKey)
  if (cached) return cached

  const res = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`
  )

  const data = await res.json()
  const entity = data.entities?.[qid]

  const coord = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value

  if (!coord?.latitude || !coord?.longitude) return null

  const result: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [coord.longitude, coord.latitude]
        },
        properties: { qid }
      }
    ]
  }

  setCache(cacheKey, result)
  return result
}

async function getSpokenInCountries(languageQid: string): Promise<string[]> {
  const res = await fetch(
    `https://query.wikidata.org/sparql?query=${encodeURIComponent(`
      SELECT DISTINCT ?country WHERE {
        { ?country wdt:P37 wd:${languageQid}. }
        UNION
        { ?country wdt:P2936 wd:${languageQid}. }
      }
      LIMIT 5
    `)}&format=json`
  )

  const data = await res.json()

  return (data.results.bindings || [])
    .map((b: any) => b.country.value.split("/").pop())
    .filter(Boolean)
}

export async function getEditTravelMap(
  username: string,
  days: number
): Promise<TravelResult> {
  const start = new Date().toISOString()
  const end = getISODateDaysAgo(days)

  let ucContinue: string | undefined

  const contribs: any[] = []
  do {
    const url = new URL("https://en.wikipedia.org/w/api.php")
    url.searchParams.set("action", "query")
    url.searchParams.set("list", "usercontribs")
    url.searchParams.set("ucuser", username)
    url.searchParams.set("uclimit", "200")
    url.searchParams.set("ucprop", "title|timestamp")
    url.searchParams.set("ucstart", start)
    url.searchParams.set("ucend", end)
    url.searchParams.set("ucnamespace", "0")
    url.searchParams.set("format", "json")
    url.searchParams.set("origin", "*")

    if (ucContinue) url.searchParams.set("uccontinue", ucContinue)

    const res = await safeFetch(url.toString())
    const data = await res.json()

    contribs.push(...(data.query?.usercontribs || []))
    ucContinue = data.continue?.uccontinue
  } while (ucContinue)

  const uniqueTitles = Array.from(
    new Map(contribs.map(c => [c.title, c])).values()
  )

  const languagePoints: TravelResult["languagePoints"] = {}
  const seenFeatures = new Set<string>()

  const allLanguages = new Set<string>()
  let qidCount = 0

  for (const contrib of uniqueTitles) {
    const title = contrib.title
    const editedAt = contrib.timestamp

    const [pageviews, qids] = await Promise.all([
      getPageViewsSince(title, editedAt),
      getQidsFromTitle(title)
    ])

    qidCount += qids.length
    const languages = new Set<string>()

    for (const qid of qids) {
      const langs = await getSitelinkLanguages(qid)
      langs.forEach(l => {
        languages.add(l)
        allLanguages.add(l)
      })
    }

    for (const lang of languages) {
      const langQids = languageToQid[lang]
      if (!langQids) continue

      const qidList = Array.isArray(langQids) ? langQids : [langQids]

      for (const langQid of qidList) {
        const countries = await getSpokenInCountries(langQid)

        for (const country of countries.slice(0, 5)) {
          const geo = await getCountryGeometry(country)
          if (!geo) continue

          if (!languagePoints[lang]) {
            languagePoints[lang] = {
              type: "FeatureCollection",
              features: []
            }
          }

          for (const f of geo.features) {
            const key = `${title}-${f.geometry?.coordinates?.join(",")}-${lang}`

            if (seenFeatures.has(key)) continue
            seenFeatures.add(key)

            languagePoints[lang].features.push({
              ...f,
              properties: {
                ...(f.properties || {}),
                title,
                pageviews,
                editedAt
              }
            })
          }
        }
      }
    }
  }

  const languagesArr = Array.from(allLanguages)

  const languageInfoRes = await safeFetch(
    "https://en.wikipedia.org/w/api.php?action=query&meta=languageinfo&liprop=code|name&format=json&origin=*"
  )

  const languageInfoData = await languageInfoRes.json()
  const languageInfo = languageInfoData.query.languageinfo || {}

  return {
    qidCount,
    languages: languagesArr,
    languageNames: languagesArr.map(l => languageInfo[l]?.name || l),
    languagePoints
  }
}
