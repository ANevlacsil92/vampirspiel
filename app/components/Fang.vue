<script setup lang="ts">
import { useId } from 'vue'

const props = withDefaults(
  defineProps<{
    color: string
    /** Gesetzt = gestreifter Halm */
    color2?: string
    label?: string
    filled?: boolean
    count?: number
    fresh?: boolean
  }>(),
  { filled: false, count: 0, fresh: false, label: '', color2: undefined },
)

const D = 'M2 1h11a1 1 0 0 1 1 1v8.5c0 6.8-3.4 11.4-6.5 13.2C4.4 21.9 1 17.3 1 10.5V2a1 1 0 0 1 1-1z'

// Pro Instanz eindeutig: die Komponente steht in der Dracula-Ansicht
// dutzendfach im DOM, und gleiche Pattern-IDs wuerden sich gegenseitig
// ueberschreiben – alle Zaehne haetten dann dasselbe Muster.
const uid = useId()
const patternId = computed(() => `fang-stripes-${uid}`)

const striped = computed(() => props.filled && !!props.color2)
const paint = computed(() => {
  if (!props.filled) return 'transparent'
  return striped.value ? `url(#${patternId.value})` : props.color
})

const title = computed(() => {
  if (!props.label) return undefined
  if (!props.filled) return `${props.label}: fehlt`
  return props.count > 1 ? `${props.label}: ${props.count}×` : `${props.label}: da`
})
</script>

<template>
  <svg
    class="fang"
    :class="{ 'fang--new': fresh && filled }"
    viewBox="0 0 15 25"
    aria-hidden="true"
    focusable="false"
  >
    <title v-if="title">{{ title }}</title>

    <defs v-if="striped">
      <!-- userSpaceOnUse: Streifenbreite in viewBox-Einheiten, skaliert also
           mit der Zahngroesse mit statt bei kleinen Zaehnen zu verschmieren. -->
      <pattern
        :id="patternId"
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(-45)"
      >
        <rect width="6" height="6" :fill="color" />
        <rect width="3" height="6" :fill="color2" />
      </pattern>
    </defs>

    <path
      :d="D"
      :fill="paint"
      :stroke="filled ? 'none' : 'var(--edge)'"
      stroke-width="1.4"
    />

    <!-- Duenne Kontur bei gestreiften Zaehnen: sonst verschwindet ein heller
         Streifen am Rand im dunklen Hintergrund und der Zahn franst aus. -->
    <path
      v-if="striped"
      :d="D"
      fill="none"
      stroke="rgba(0,0,0,.35)"
      stroke-width="1"
    />

    <text
      v-if="count > 1"
      x="7.5"
      y="12"
      text-anchor="middle"
      font-size="8"
      font-weight="800"
      fill="rgba(0,0,0,.55)"
    >
      {{ count }}
    </text>
  </svg>
</template>