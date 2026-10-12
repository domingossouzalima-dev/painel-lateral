export type AgentRow = {
  id: string
  label: string
  kind: string
  isDone: boolean
  tokens: number
  activity: string[]
  created: string[]
  deleted: string[]
}
export type Panel = {
  costUsd: number
  tokens: number
  agents: Record<string, AgentRow>
  order: string[]
  selected: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'painel-lateral': { panel: Panel }
  }
}
