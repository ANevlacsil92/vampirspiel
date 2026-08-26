<script setup lang="ts">
import { tally, teethKey } from '~/composables/useGame'

const { state, online, status, deniedReason, myVampireId, role, dispatch, login, logout, buzz } =
  useGame()
const router = useRouter()

const me = computed(() => state.value?.vampires.find(v => v.id === myVampireId.value) || null)
const needsPick = computed(() => role.value !== 'vampir' || !me.value)

const groups = computed(() => (state.value?.groups || []).filter(g => g.active))

function mine(groupId: string): number {
  if (!state.value || !myVampireId.value) return 0
  return state.value.teeth[teethKey(groupId, myVampireId.value)] || 0
}

// --- Rückgängig-Leiste -----------------------------------------------------

const undo = ref<{ text: string; kind: string; payload: any } | null>(null)
let undoTimer: any = null

function offerUndo(text: string, kind: string, payload: any) {
  clearTimeout(undoTimer)
  undo.value = { text, kind, payload }
  undoTimer = setTimeout(() => (undo.value = null), 8000)
}

function runUndo() {
  if (!undo.value) return
  dispatch(undo.value.kind, undo.value.payload)
  undo.value = null
  clearTimeout(undoTimer)
  buzz(8)
}

onBeforeUnmount(() => clearTimeout(undoTimer))

// --- Aktionen --------------------------------------------------------------

function give(groupId: string, groupName: string) {
  if (!myVampireId.value) return
  dispatch('give', { groupId, vampireId: myVampireId.value })
  buzz([10, 40, 10])
  offerUndo(`${groupName} hat deinen Zahn`, 'take', { groupId, vampireId: myVampireId.value })
}

function take(groupId: string, groupName: string) {
  if (!myVampireId.value) return
  dispatch('take', { groupId, vampireId: myVampireId.value })
  buzz(20)
  offerUndo(`Zahn bei ${groupName} zurückgenommen`, 'give', {
    groupId,
    vampireId: myVampireId.value,
  })
}

// --- Farbwahl --------------------------------------------------------------

const takenIds = computed(() => new Set(online.value))

function pick(vampireId: string, force = false) {
  login('vampir', { vampireId, force })
}

const wanted = ref<string | null>(null)
</script>

<template>
  <main class="shell">
    <div class="topbar">
      <div class="grow row" style="gap: 9px">
        <Fang v-if="me" :color="me.color" filled style="width: 13px; height: 22px" />
        <strong>{{ me ? me.label : 'Vampir' }}</strong>
      </div>
      <ConnBadge />
      <button class="btn btn--ghost" @click="logout(); router.push('/')">Wechseln</button>
    </div>

    <!-- Farbe wählen -->
    <div v-if="needsPick" class="stack">
      <div>
        <h1>Welche Farbe hast du?</h1>
        <p class="muted" style="margin: 6px 0 0">
          Nimm die Farbe deiner Strohhalme. Belegte Farben sind ausgegraut.
        </p>
      </div>

      <div v-if="deniedReason" class="banner banner--bad">
        {{ deniedReason }}
        <button
          v-if="wanted"
          class="btn btn--ghost"
          style="margin-left: 6px"
          @click="pick(wanted, true)"
        >
          Trotzdem übernehmen
        </button>
      </div>

      <p v-if="state && !state.vampires.length" class="muted">
        Die Spielleitung hat noch keine Farben angelegt.
      </p>

      <div
        v-else
        style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px"
      >
        <button
          v-for="v in state?.vampires || []"
          :key="v.id"
          class="btn btn--big row"
          :style="{ opacity: takenIds.has(v.id) ? 0.45 : 1, justifyContent: 'flex-start' }"
          @click="wanted = v.id; pick(v.id)"
        >
          <Fang :color="v.color" filled />
          <span style="flex: 1; text-align: left">
            {{ v.label }}
            <span v-if="takenIds.has(v.id)" class="eyebrow" style="display: block">belegt</span>
          </span>
        </button>
      </div>
    </div>

    <!-- Gruppenliste -->
    <div v-else class="stack" style="padding-bottom: 80px">
      <div v-if="status === 'offline'" class="banner banner--warn">
        Kein Netz. Deine Taps werden gemerkt und nachgeschickt, sobald es wieder geht.
      </div>

      <div v-if="state?.phase === 'setup'" class="banner">
        Das Spiel läuft noch nicht. Du kannst schon Zähne vergeben, es zählt aber erst ab dem Start.
      </div>

      <p v-if="!groups.length" class="muted">Noch keine Gruppen angelegt.</p>

      <div v-for="g in groups" :key="g.id" class="card" style="padding: 0; overflow: hidden">
        <button
          class="row"
          :disabled="mine(g.id) > 0"
          style="
            width: 100%;
            min-height: var(--tap);
            background: none;
            border: 0;
            color: inherit;
            font: inherit;
            padding: 12px 14px;
            text-align: left;
            cursor: pointer;
          "
          @click="give(g.id, g.name)"
        >
          <div style="flex: 1; min-width: 0">
            <div style="font-size: 18px; font-weight: 700">{{ g.name }}</div>
            <div class="eyebrow" style="margin-top: 2px">
              {{ tally(state!, g.id).have }} von {{ tally(state!, g.id).need }} Zähnen
            </div>
          </div>

          <div v-if="mine(g.id) > 0" class="row" style="gap: 8px">
            <Fang
              :color="me!.color"
              :label="me!.label"
              filled
              :count="mine(g.id)"
              fresh
              style="width: 20px; height: 33px"
            />
          </div>
          <div v-else class="eyebrow" style="color: var(--moon)">Zahn geben</div>
        </button>

        <div
          v-if="mine(g.id) > 0"
          class="row"
          style="border-top: 1px solid var(--edge); padding: 4px 8px"
        >
          <span class="muted" style="flex: 1; padding-left: 6px">Dein Zahn ist drin</span>
          <button class="btn btn--ghost" @click="take(g.id, g.name)">Zurücknehmen</button>
        </div>
      </div>
    </div>

    <div v-if="undo" class="toast">
      <span class="grow">{{ undo.text }}</span>
      <button class="btn" @click="runUndo">Rückgängig</button>
    </div>
  </main>
</template>
