<script setup lang="ts">
import { CdxIcon, CdxProgressIndicator, CdxTextInput } from '@wikimedia/codex'
import { cdxIconHelpNotice } from '@wikimedia/codex-icons'
import { getEditTravelMap } from './useGetTravelLocations'

import ChromeWrapper from '@/components/ChromeWrapper.vue'
import SpecialPageWrapper from '@/components/SpecialPageWrapper.vue'
import { onMounted, ref } from 'vue'
import TravelMap from '@/prototypes/travel-map/TravelMap.vue'
import type { Feature, FeatureCollection } from 'geojson'

const loading = ref(true)
const daysInput = ref(30)
const days = ref(30)

type EnrichedFeature = Feature & {
  properties: {
    title: string
    pageviews: number | null
    editedAt: string
    fallback?: boolean
  }
}

const result = ref<null | {
  qidCount: number
  languages: string[]
  languageNames: string[]
  languagePoints: {
    [lang: string]: FeatureCollection & { features: EnrichedFeature[] }
  }
}>(null)

// TODO: this wouldn't be hardcoded
const username = 'Samwalton9'

async function fetchData() {
  loading.value = true
  try {
    result.value = await getEditTravelMap(username, days.value)
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}


function commitDays() {
  const parsed = Number(daysInput.value)

  if (!Number.isNaN(parsed) && parsed > 0) {
    days.value = parsed
    fetchData()
  }
}

onMounted(async () => {
  await fetchData()
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

      <cdx-progress-indicator v-if="loading">
        ProgressIndicator label
      </cdx-progress-indicator>

      <div v-if="!loading" class="days-input">
        <cdx-text-input
          v-model="daysInput"
          input-type="number"
          placeholder="30"
          @blur="commitDays"
          @keyup.enter="commitDays"
        />
      </div>

      <h3 v-if="!loading">
        In the last {{ days }} days your edits link to knowledge that spans
        {{ result?.languageNames.length }} Wikipedia languages.
      </h3>

      <p v-if="!loading">
        This map follows the knowledge behind your edits: from Wikipedia pages to Wikidata topics,
        then across language editions and the regions of the world where those languages are used.
        It reveals the global footprint of the topics you’ve worked on.
      </p>

      <TravelMap
        v-if="!loading"
        :language-points="result?.languagePoints"
      />
    </SpecialPageWrapper>
  </ChromeWrapper>
</template>

<style scoped>
.days-input {
  max-width: 120px;
}
</style>
