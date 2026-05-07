<script setup lang="ts">
import { CdxIcon, CdxProgressIndicator, CdxTextInput, CdxSelect } from '@wikimedia/codex'
import { cdxIconHelpNotice } from '@wikimedia/codex-icons'
import { getEditTravelMap } from './useGetTravelLocations'

import ChromeWrapper from '@/components/ChromeWrapper.vue'
import SpecialPageWrapper from '@/components/SpecialPageWrapper.vue'
import { onMounted, ref, computed } from 'vue'
import TravelMap from '@/prototypes/travel-map/TravelMap.vue'
import type { Feature, FeatureCollection } from 'geojson'

const loading = ref(true)
const daysInput = ref(30)
const days = ref(30)
const selectedLanguage = ref('all')

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

/**
 * Filtered points based on the CdxSelect value
 */
const filteredLanguagePoints = computed(() => {
  if (!result.value) return {}
  if (selectedLanguage.value === 'all') {
    return result.value.languagePoints
  }

  const lang = selectedLanguage.value
  return {
    [lang]: result.value.languagePoints[lang],
  }
})

/**
 * Menu options for the Select component
 */
const languageOptions = computed(() => {
  const options = [{ label: 'All Languages', value: 'all' }]
  if (result.value) {
    result.value.languages.forEach((lang, index) => {
      options.push({
        label: result.value?.languageNames[index] || lang,
        value: lang,
      })
    })
  }
  return options
})

async function fetchData() {
  loading.value = true
  try {
    result.value = await getEditTravelMap(username, days.value)
    // Reset filter when new data is fetched
    selectedLanguage.value = 'all'
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
    <SpecialPageWrapper title="Your Wikidata Knowledge Travel Log">
      <template #help>
        <a href="https://doc.wikimedia.org/codex/latest/" rel="noopener noreferrer">
          <CdxIcon size="small" :icon="cdxIconHelpNotice" />
          <span>Help</span>
        </a>
      </template>

      <cdx-progress-indicator v-if="loading">
        Loading travel data...
      </cdx-progress-indicator>

      <div v-if="!loading" class="controls">
        <div class="control-group">
          <label>Lookback (days)</label>
          <cdx-text-input
            v-model="daysInput"
            input-type="number"
            placeholder="30"
            @blur="commitDays"
            @keyup.enter="commitDays"
          />
        </div>

        <div class="control-group">
          <label>Filter by Language</label>
          <cdx-select
            v-model:selected="selectedLanguage"
            :menu-items="languageOptions"
            class="language-filter"
          />
        </div>
      </div>

      <h3 v-if="!loading">
        In the last {{ days }} days, your edits are linked through Wikidata across {{ result?.languageNames.length
        }} Wikipedia language editions.
      </h3>

      <p v-if="!loading">
        This map follows the knowledge behind your edits: from Wikipedia pages to their Wikidata items, and then through
        Wikidata sitelinks to the same topics in other Wikipedia language editions around the world.
        <a href="https://www.wikidata.org/wiki/Help:Sitelinks"
           target="_blank"
        >Sitelinks</a> connect identical concepts across languages and the regions where those languages are used.
      </p>

      <TravelMap
        v-if="!loading"
        :language-points="filteredLanguagePoints"
      />
    </SpecialPageWrapper>
  </ChromeWrapper>
</template>

<style scoped>
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
  align-items: flex-end;
  position: relative;
  z-index: 999999;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-group label {
  font-size: 0.875rem;
  font-weight: 600;
}

.days-input {
  max-width: 120px;
}

.language-filter {
  min-width: 200px;
}
</style>
