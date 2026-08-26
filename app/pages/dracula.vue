<script setup lang="ts">
import { tally, teethKey } from '~/composables/useGame'

const { state, status, role, dispatch, logout, buzz } = useGame()
const router = useRouter()

onMounted(() => {
  if (role.value !== 'dracula' && role.value !== 'admin') router.replace('/')
})

const groups = computed(() => (state.value?.groups || []).filter(g => g.active))
const actives = computed(() => (state.value?.vampires || []).filter(v => v.active))

function count(groupId: string, vampireId: string) {
  return state.value?.teeth[teethKey(groupId, vampireId)] || 0
}

/** Was hat die Gruppe gerade in der Hand? */
function held(groupId: string) {
  return actives.value.filter(v => count(groupId, v.id) > 0)
}

// --- Abnehmen --------------------------------------------------------------

const openGroup = ref<string | null>(null)
const selected = ref<Set<string>>(new Set())

function openFor(groupId: string) {
  openGroup.value = openGroup.value === groupId ? null : groupId
  selected.value = new Set()
}

function toggle(vampireId: string) {
  const next = new Set(selected.value)
  next.has(vampireId) ? next.delete(vampireId) : next.add(vampireId)
  selected.value = next
  buzz(6)
}

function selectAll(groupId: string) {
  selected.value = new Set(held(groupId).map(v => v.id))
  buzz(6)
}

const undo = ref<{ text: string; groupId: string; vampireIds: string[] } | null>(null)
let undoTimer: any = null

function drain(groupId: string, groupName: string) {
  const ids = [...selected.value]
  if (!ids.length) return
  dispatch('drain', { groupId, vampireIds: ids })
  buzz([25, 60, 25])
  clearTimeout(undoTimer)
  undo.value = {
    text: `${ids.length} ${ids.length === 1 ? 'Zahn' : 'Zähne'} von ${groupName} genommen`,
    groupId,
    vampireIds: ids,
  }
  undoTimer = setTimeout(() => (undo.value = null), 10_000)
  openGroup.value = null
  selected.value = new Set()
}

function runUndo() {
  if (!undo.value) return
  for (const vid of undo.value.vampireIds) {
    dispatch('give', { groupId: undo.value.groupId, vampireId: vid })
  }
  undo.value = null
  clearTimeout(undoTimer)
}

onBeforeUnmount(() => clearTimeout(undoTimer))

// --- Laufzeit --------------------------------------------------------------

const now = ref(Date.now())
let clock: any = null
onMounted(() => {
  clock = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(clock))

const elapsed = computed(() => {
  if (!state.value?.startedAt) return null
  const s = Math.floor((now.value - state.value.startedAt) / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
})

const winners = computed(() => {
  if (!state.value) return []
  return state.value.finished
    .map(f => state.value!.groups.find(g => g.id === f.groupId))
    .filter(Boolean)
})
</script>

<template>
  <main class="shell">
    <div class="topbar">
      <div class="grow row" style="gap: 9px">
        <strong>Dracula</strong>
        <span v-if="elapsed" class="count muted" style="font-size: 15px">{{ elapsed }}</span>
      </div>
      <ConnBadge />
      <button class="btn btn--ghost" @click="logout(); router.push('/')">Wechseln</button>
    </div>

    <div class="stack" style="padding-bottom: 90px">
      <div v-if="status === 'offline'" class="banner banner--warn">
        Kein Netz. Was du antippst, wird nachgeschickt.
      </div>

      <div v-if="winners.length" class="banner banner--warn">
        Fertig: {{ winners.map(g => g!.name).join(', ') }}
      </div>

      <p v-if="!groups.length" class="muted">Noch keine Gruppen angelegt.</p>

      <div v-for="g in groups" :key="g.id" class="card" style="padding: 0; overflow: hidden">
        <button
          class="row"
          style="
            width: 100%;
            background: none;
            border: 0;
            color: inherit;
            font: inherit;
            padding: 12px 14px;
            text-align: left;
            cursor: pointer;
            align-items: flex-start;
          "
          @click="openFor(g.id)"
        >
          <div style="flex: 1; min-width: 0">
            <div class="row" style="gap: 8px">
              <span style="font-size: 18px; font-weight: 700">{{ g.name }}</span>
              <span
                v-if="state!.finished.some(f => f.groupId === g.id)"
                class="eyebrow"
                style="color: #e6c47a"
              >komplett</span>
            </div>
            <div class="fangs" style="margin-top: 8px">
              <Fang
                v-for="v in actives"
                :key="v.id"
                :color="v.color"
                :color2="v.color2"
                :label="v.label"
                :filled="count(g.id, v.id) > 0"
                :count="count(g.id, v.id)"
              />
            </div>
          </div>
          <div class="count" style="font-size: 30px; margin-left: 12px">
            {{ tally(state!, g.id).have }}<span
              class="muted"
              style="font-size: 15px; font-weight: 600"
            >/{{ tally(state!, g.id).need }}</span>
          </div>
        </button>

        <div v-if="openGroup === g.id" style="border-top: 1px solid var(--edge); padding: 12px 14px">
          <div v-if="!held(g.id).length" class="muted">Diese Gruppe hat noch keinen Zahn.</div>

          <template v-else>
            <div class="eyebrow" style="margin-bottom: 8px">Welche Halme nimmst du?</div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px">
              <button
                v-for="v in held(g.id)"
                :key="v.id"
                class="btn row"
                style="gap: 8px; padding: 10px 12px"
                :style="{
                  borderColor: selected.has(v.id) ? 'var(--moon)' : 'var(--edge)',
                  background: selected.has(v.id) ? 'var(--ink-3)' : 'var(--ink)',
                }"
                @click="toggle(v.id)"
              >
                <Fang :color="v.color" :color2="v.color2" filled style="width: 12px; height: 20px" />
                <span>{{ v.label }}</span>
                <span v-if="count(g.id, v.id) > 1" class="muted">×{{ count(g.id, v.id) }}</span>
              </button>
            </div>

            <div class="row" style="margin-top: 14px">
              <button class="btn btn--ghost" @click="selectAll(g.id)">Alle</button>
              <div style="flex: 1" />
              <button
                class="btn btn--danger btn--big"
                :disabled="!selected.size"
                @click="drain(g.id, g.name)"
              >
                {{ selected.size || '' }} Nehmen
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-if="undo" class="toast">
      <span class="grow">{{ undo.text }}</span>
      <button class="btn" @click="runUndo">Rückgängig</button>
    </div>
  </main>
</template>