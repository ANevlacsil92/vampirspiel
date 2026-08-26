<script setup lang="ts">
const { state, role, status } = useGame()
const router = useRouter()

const pinFor = ref<'dracula' | 'admin' | null>(null)
const pin = ref('')
const { login, deniedReason } = useGame()

// Wer schon angemeldet ist, kommt direkt weiter
onMounted(() => {
  if (role.value === 'vampir') router.replace('/vampir')
  else if (role.value === 'dracula') router.replace('/dracula')
  else if (role.value === 'admin') router.replace('/leitung')
})

function submitPin() {
  if (!pinFor.value) return
  login(pinFor.value, { pin: pin.value })
  const target = pinFor.value === 'dracula' ? '/dracula' : '/leitung'
  pin.value = ''
  pinFor.value = null
  router.push(target)
}
</script>

<template>
  <main class="shell">
    <div class="topbar">
      <div class="grow">
        <div class="eyebrow">Vampirspiel</div>
      </div>
      <ConnBadge />
    </div>

    <div class="stack" style="gap: 20px; padding-top: 8px">
      <div>
        <h1>Wer bist du?</h1>
        <p class="muted" style="margin: 6px 0 0">
          Die Auswahl bleibt am Handy gespeichert. Du musst das nur einmal machen.
        </p>
      </div>

      <div v-if="!pinFor" class="stack">
        <button class="btn btn--big" @click="router.push('/vampir')">
          Vampir — ich verstecke mich
        </button>
        <button class="btn btn--big" @click="pinFor = 'dracula'">
          Dracula — ich nehme Zähne ab
        </button>
        <button class="btn btn--big" @click="pinFor = 'admin'">
          Spielleitung — Aufbau und Übersicht
        </button>
      </div>

      <div v-else class="card stack">
        <div class="field">
          <label class="eyebrow" for="pin">
            PIN für {{ pinFor === 'dracula' ? 'Dracula' : 'die Spielleitung' }}
          </label>
          <input
            id="pin"
            v-model="pin"
            type="password"
            inputmode="numeric"
            autocomplete="off"
            placeholder="••••"
            @keyup.enter="submitPin"
          >
        </div>
        <div v-if="deniedReason" class="banner banner--bad">{{ deniedReason }}</div>
        <div class="row">
          <button class="btn btn--ghost" @click="pinFor = null; pin = ''">Zurück</button>
          <div style="flex: 1" />
          <button class="btn" :disabled="!pin" @click="submitPin">Weiter</button>
        </div>
      </div>

      <p v-if="state && !state.groups.length" class="muted">
        Es ist noch kein Spiel aufgebaut. Die Spielleitung legt Gruppen und Farben an.
      </p>
    </div>
  </main>
</template>
