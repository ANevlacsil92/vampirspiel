<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    color: string
    label?: string
    filled?: boolean
    count?: number
    fresh?: boolean
  }>(),
  { filled: false, count: 0, fresh: false, label: '' },
)

const D = 'M2 1h11a1 1 0 0 1 1 1v8.5c0 6.8-3.4 11.4-6.5 13.2C4.4 21.9 1 17.3 1 10.5V2a1 1 0 0 1 1-1z'

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
    <path
      :d="D"
      :fill="filled ? color : 'transparent'"
      :stroke="filled ? 'none' : 'var(--edge)'"
      stroke-width="1.4"
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
