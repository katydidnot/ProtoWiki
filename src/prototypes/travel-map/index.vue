<script setup lang="ts">
import { CdxIcon, CdxProgressIndicator } from '@wikimedia/codex'
import { cdxIconHelpNotice } from '@wikimedia/codex-icons'
import { getEditTravelMap } from './useGetTravelLocations'

import ChromeWrapper from '@/components/ChromeWrapper.vue'
import SpecialPageWrapper from '@/components/SpecialPageWrapper.vue'
import { onMounted, ref } from 'vue'
import TravelMap from '@/prototypes/travel-map/TravelMap.vue'
import { GeoJSON } from 'leaflet'

const loading = ref(true)
const result = ref<null | {
  qidCount: number
  languages: string[],
  languageNames: string[],
  languagePoints:{
    [lang: string]: GeoJSON.FeatureCollection[]
  }
}>(null)

// you can replace this with the logged-in user later
const username = 'Samwalton9'

onMounted(async () => {
  try {
    result.value = await getEditTravelMap(username)
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
})


definePage({
  meta: {
    title: 'Where your edits have traveled.',
    description: 'See where pages you have edited have traveled to.',
  },
})

</script>

<template>
  <ChromeWrapper>
    <SpecialPageWrapper title="Knowledge Travel Log">
      <template #help>
        <a href="https://doc.wikimedia.org/codex/latest/" rel="noopener noreferrer">
          <CdxIcon size="small" :icon="cdxIconHelpNotice" />
          <span>Help</span>
        </a>
      </template>

      <cdx-progress-indicator v-if="loading">ProgressIndicator label</cdx-progress-indicator>
      <h3 v-if="!loading">In the last 30 days your edits link to knowledge that spans {{ result?.languageNames.length }} Wikipedia languages.</h3>
      <p v-if="!loading">  This map follows the knowledge behind your edits: from Wikipedia pages to Wikidata topics, then across language editions and the regions of the world where those languages are used. It reveals the global footprint of the topics you’ve worked on.</p>
      <TravelMap v-if="!loading" :language-points="result?.languagePoints" />
    </SpecialPageWrapper>
  </ChromeWrapper>
</template>
