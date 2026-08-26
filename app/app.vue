<script setup lang="ts">
const { lastError } = useGame()

watch(lastError, (v) => {
  if (!v) return
  setTimeout(() => {
    if (lastError.value === v) lastError.value = null
  }, 4000)
})
</script>

<template>
  <div>
    <NuxtPage />
    <div v-if="lastError" class="toast">
      <span class="grow">{{ lastError }}</span>
      <button class="btn btn--ghost" @click="lastError = null">OK</button>
    </div>
  </div>
</template>
