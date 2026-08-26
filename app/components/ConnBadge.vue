<script setup lang="ts">
const { status, pending } = useGame()

const text = computed(() => {
  if (status.value === 'online') return pending.value ? `${pending.value} offen` : 'verbunden'
  if (status.value === 'offline') return pending.value ? `${pending.value} wartet` : 'kein Netz'
  if (status.value === 'denied') return 'abgelehnt'
  return 'verbinde …'
})
</script>

<template>
  <div class="row" style="gap: 7px">
    <span
      class="pip"
      :class="{
        'pip--online': status === 'online' && !pending,
        'pip--offline': status === 'offline' || (status === 'online' && pending),
        'pip--denied': status === 'denied',
      }"
    />
    <span class="eyebrow">{{ text }}</span>
  </div>
</template>
