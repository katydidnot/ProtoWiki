<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import L, { GeoJSON } from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Props = {
  languagePoints: {
    [lang: string]: GeoJSON.FeatureCollection[]
  }
}

const props = defineProps<Props>()

const mapEl = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null

// store layers so we can clean properly
const layerGroup = L.layerGroup()

onMounted(() => {
  map = L.map(mapEl.value!).setView([20, 0], 2)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map)

  layerGroup.addTo(map)

  render()
})

// -------------------------
// consistent color per language
// -------------------------
function colorFromString(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = hash % 360
  return `hsl(${hue}, 70%, 50%)`
}

// -------------------------
// render
// -------------------------
function render() {
  if (!map) return

  layerGroup.clearLayers()

  for (const [lang, featureCollections] of Object.entries(props.languagePoints)) {
    const color = colorFromString(lang)

    // -------------------------
    // marker icon (language dot)
    // -------------------------
    const icon = L.divIcon({
      className: '',
      html: `
    <div style="
      width:14px;
      height:14px;
      background:${color};
      border-radius:50%;
      border:2px solid white;
      box-shadow:0 0 4px rgba(0,0,0,0.4);
    "></div>
  `,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    })

    for (const geojson of featureCollections) {
      const layer = L.geoJSON(geojson, {
        style: {
          color,
          fillColor: color,
          fillOpacity: 0.35,
          weight: 1
        },
        pointToLayer: (_, latlng) => {
          return L.marker(latlng, { icon })
        },
        onEachFeature: (feature, layer) => {
          layer.bindPopup(`<b style="color:${color}">${lang}</b>`)
        }
      })

      layerGroup.addLayer(layer)

      // -------------------------
      // OPTIONAL: add centroid marker
      // -------------------------
      const center = layer.getBounds?.().getCenter?.()

      if (center) {
        const marker = L.marker(center, { icon }).bindPopup(
          `<b style="color:${color}">${lang}</b>`
        )
        layerGroup.addLayer(marker)
      }
    }
  }
}

// -------------------------
// reactive update
// -------------------------
watch(
  () => props.languagePoints,
  () => {
    render()
  }
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

.lang-marker {
  background: transparent;
}
</style>
