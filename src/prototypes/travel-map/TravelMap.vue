<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Feature, FeatureCollection } from 'geojson'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'

type EnrichedFeature = Feature & {
  properties: {
    title: string
    pageviews: number | null
    editedAt: string
    fallback?: boolean
  }
}

type Props = {
  languagePoints: {
    [lang: string]: FeatureCollection & { features: EnrichedFeature[] }
  }
}

const props = defineProps<Props>()

const mapEl = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null

const layerGroup = L.markerClusterGroup({
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: true
})

onMounted(() => {
  map = L.map(mapEl.value!).setView([20, 0], 2)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map)

  layerGroup.addTo(map)

  render()
})

// -------------------------
function colorFromString(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return `hsl(${hash % 360}, 70%, 50%)`
}

// -------------------------
function render() {
  if (!map) return

  layerGroup.clearLayers()

  for (const [lang, featureCollection] of Object.entries(props.languagePoints)) {
    const color = colorFromString(lang)

    for (const feature of featureCollection.features) {
      if (!feature.geometry) continue

      const props = feature.properties
      const title = props?.title ?? 'Unknown'
      const pageviews = props?.pageviews ?? 0
      const editedAt = props?.editedAt ?? ''

      const radius = 10;
      const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
      const popup = `
        <div style="min-width:180px">
          <b style="color:${color}">${lang}</b><br/>
          <a href="${wikiUrl}" target="_blank">${title}</a><br/>
          <small>Views: ${pageviews ?? 'N/A'}</small><br/>
          <small>Edited: ${new Date(editedAt).toLocaleString()}</small>
        </div>
      `
      if (feature.geometry.type === 'Point') {
        const coords = feature.geometry.coordinates as [number, number]

        const marker = L.circleMarker([coords[1], coords[0]], {
          radius,
          color,
          fillColor: color,
          fillOpacity: 0.6,
          weight: 1
        }).bindPopup(popup)

        layerGroup.addLayer(marker)
      }
      else {
        const layer = L.geoJSON(feature, {
          style: {
            color,
            fillColor: color,
            fillOpacity: 0.25,
            weight: 1
          },
          onEachFeature: (_, layer) => {
            layer.bindPopup(popup)
          }
        })

        layerGroup.addLayer(layer)
      }
    }
  }
}

// -------------------------
watch(
  () => props.languagePoints,
  () => render(),
  { deep: true }
)
</script>

<template>
  <div ref="mapEl" class="map"></div>
</template>

<style scoped>
.map {
  height: 500px;
  width: 100%;
  border-radius: 8px;
}
</style>
