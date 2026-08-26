<script setup lang="ts">
import { tally } from '~/composables/useGame'

const { state, online, role, dispatch, logout } = useGame()
const router = useRouter()

onMounted(() => {
  if (role.value !== 'admin') router.replace('/')
})

// --- Aufbau ----------------------------------------------------------------

const groupText = ref('')
const chosen = ref<string[]>([])
const confirmingSetup = ref(false)
const confirmingReset = ref(false)

// Vorhandenen Aufbau in die Felder spiegeln, sobald der State da ist
watch(
  state,
  (s) => {
    if (!s || groupText.value) return
    if (s.groups.length) groupText.value = s.groups.map(g => g.name).join('\n')
    else groupText.value = Array.from({ length: 7 }, (_, i) => `Gruppe ${i + 1}`).join('\n')
    if (s.vampires.length && !chosen.value.length) chosen.value = s.vampires.map(v => v.label)
  },
  { immediate: true },
)

const groupNames = computed(() =>
  groupText.value
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean),
)

function toggleColor(label: string) {
  chosen.value = chosen.value.includes(label)
    ? chosen.value.filter(l => l !== label)
    : [...chosen.value, label]
}

const canBuild = computed(() => groupNames.value.length > 0 && chosen.value.length > 0)

function build() {
  const vampires = chosen.value
    .map(label => PALETTE.find(p => p.label === label))
    .filter(Boolean) as { label: string; color: string }[]
  dispatch('setup', { groups: groupNames.value, vampires })
  confirmingSetup.value = false
}

const hasProgress = computed(() => Object.keys(state.value?.teeth || {}).length > 0)
</script>

<template>
  <main class="shell">
    <div class="topbar">
      <div class="grow"><strong>Spielleitung</strong></div>
      <ConnBadge />
      <button class="btn btn--ghost" @click="logout(); router.push('/')">Wechseln</button>
    </div>

    <div class="stack" style="gap: 18px; padding-bottom: 40px">
      <!-- Ablauf -->
      <div class="card stack">
        <div class="row">
          <div style="flex: 1">
            <div class="eyebrow">Status</div>
            <div style="font-size: 20px; font-weight: 700">
              {{
                state?.phase === 'running'
                  ? 'Spiel läuft'
                  : state?.phase === 'ended'
                    ? 'Beendet'
                    : 'Aufbau'
              }}
            </div>
          </div>
          <button
            v-if="state?.phase !== 'running'"
            class="btn"
            :disabled="!state?.groups.length || !state?.vampires.length"
            @click="dispatch('start')"
          >
            Spiel starten
          </button>
          <button v-else class="btn btn--danger" @click="dispatch('end')">Beenden</button>
        </div>
      </div>

      <!-- Übersicht -->
      <div v-if="state?.groups.length" class="stack">
        <div class="eyebrow">Stand</div>
        <div v-for="g in state.groups" :key="g.id" class="card row">
          <div style="flex: 1; min-width: 0">
            <div style="font-weight: 700">{{ g.name }}</div>
            <div class="fangs" style="margin-top: 6px">
              <Fang
                v-for="v in state.vampires.filter(x => x.active)"
                :key="v.id"
                :color="v.color"
                :label="v.label"
                :filled="(state.teeth[`${g.id}|${v.id}`] || 0) > 0"
                :count="state.teeth[`${g.id}|${v.id}`] || 0"
              />
            </div>
          </div>
          <div class="count" style="font-size: 24px">
            {{ tally(state, g.id).have }}<span class="muted" style="font-size: 14px">/{{
              tally(state, g.id).need
            }}</span>
          </div>
        </div>
      </div>

      <!-- Vampire an/aus -->
      <div v-if="state?.vampires.length" class="stack">
        <div class="eyebrow">Vampire im Spiel</div>
        <p class="muted" style="margin: 0">
          Ausgeschaltete Farben zählen nicht mehr für den Sieg. Nutze das, wenn ein Vampir ausfällt.
        </p>
        <div style="display: flex; flex-wrap: wrap; gap: 8px">
          <button
            v-for="v in state.vampires"
            :key="v.id"
            class="btn row"
            style="gap: 8px; padding: 10px 12px"
            :style="{ opacity: v.active ? 1 : 0.4 }"
            @click="dispatch('toggleVampire', { vampireId: v.id, active: !v.active })"
          >
            <Fang :color="v.color" :filled="v.active" style="width: 12px; height: 20px" />
            <span>{{ v.label }}</span>
            <span v-if="online.includes(v.id)" class="pip pip--online" />
          </button>
        </div>
      </div>

      <!-- Aufbau -->
      <div class="card stack">
        <div class="eyebrow">Aufbau</div>

        <div class="field">
          <label for="groups">Gruppen, eine pro Zeile</label>
          <textarea id="groups" v-model="groupText" spellcheck="false" />
          <span class="muted">{{ groupNames.length }} Gruppen</span>
        </div>

        <div class="field">
          <label>Farben der Strohhalme</label>
          <div style="display: flex; flex-wrap: wrap; gap: 8px">
            <button
              v-for="p in PALETTE"
              :key="p.label"
              class="btn row"
              style="gap: 8px; padding: 10px 12px"
              :style="{
                borderColor: chosen.includes(p.label) ? 'var(--moon)' : 'var(--edge)',
                opacity: chosen.includes(p.label) ? 1 : 0.5,
              }"
              @click="toggleColor(p.label)"
            >
              <Fang :color="p.color" filled style="width: 12px; height: 20px" />
              <span>{{ p.label }}</span>
            </button>
          </div>
          <span class="muted">{{ chosen.length }} Vampire</span>
        </div>

        <div v-if="!confirmingSetup">
          <button class="btn btn--big" :disabled="!canBuild" @click="
            hasProgress ? (confirmingSetup = true) : build()
          ">
            Aufbau übernehmen
          </button>
        </div>
        <div v-else class="banner banner--bad stack">
          <span>Es sind schon Zähne verteilt. Der neue Aufbau löscht den Stand.</span>
          <div class="row">
            <button class="btn btn--ghost" @click="confirmingSetup = false">Abbrechen</button>
            <div style="flex: 1" />
            <button class="btn btn--danger" @click="build">Trotzdem übernehmen</button>
          </div>
        </div>
      </div>

      <!-- Zurücksetzen -->
      <div class="card stack">
        <div class="eyebrow">Neue Runde</div>
        <p class="muted" style="margin: 0">
          Setzt alle Zähne auf null. Gruppen und Farben bleiben, wie sie sind.
        </p>
        <div v-if="!confirmingReset">
          <button class="btn btn--danger" @click="confirmingReset = true">Zähne zurücksetzen</button>
        </div>
        <div v-else class="row">
          <button class="btn btn--ghost" @click="confirmingReset = false">Abbrechen</button>
          <div style="flex: 1" />
          <button
            class="btn btn--danger"
            @click="dispatch('reset'); confirmingReset = false"
          >
            Wirklich zurücksetzen
          </button>
        </div>
      </div>
    </div>
  </main>
</template>
