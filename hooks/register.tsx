import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow, Panel } from '../types'

const PANE = 'painel-lateral'
const MAIN = 'main'
const empty: Panel = { costUsd: 0, tokens: 0, agents: {}, order: [], selected: null }
const panel = atom({ plugin: 'painel-lateral', key: 'panel' } as const, empty)

const row = (id: string, label: string, kind: string): AgentRow => ({
  id, label, kind, isDone: false, tokens: 0, activity: [], created: [], deleted: [],
})

const withAgent = (p: Panel, id: string, label: string, kind: string): Panel =>
  p.agents[id] ? p : { ...p, agents: { ...p.agents, [id]: row(id, label, kind) }, order: [...p.order, id] }

const patch = (p: Panel, id: string, fn: (a: AgentRow) => AgentRow): Panel => {
  const base = withAgent(p, id, id === MAIN ? 'Principal' : id.slice(0, 8), id === MAIN ? 'main' : 'agente')
  return { ...base, agents: { ...base.agents, [id]: fn(base.agents[id]) } }
}

const push = (list: string[], v: string, max = 100) =>
  list.includes(v) ? list : [...list, v].slice(-max)

// caminhos apagados por rm / unlink / git rm / trash em um comando Bash
const removed = (cmd: string): string[] => {
  const out: string[] = []
  for (const seg of cmd.split(/&&|\|\||;|\n|\|/)) {
    const t = seg.trim().replace(/^sudo\s+/, '').split(/\s+/)
    const isRm = ['rm', 'unlink', 'trash', 'trash-put'].includes(t[0]) || (t[0] === 'git' && t[1] === 'rm')
    if (!isRm) continue
    for (const a of t.slice(t[0] === 'git' ? 2 : 1)) {
      if (!a.startsWith('-')) out.push(a.replace(/^['"]|['"]$/g, ''))
    }
  }
  return out
}

// Texto e bordas usam as cores padrão da sessão; só o verde/vermelho semântico vêm do tema
const C = { ok: 'success', bad: 'error' }

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`)

function open($: any) {
  return $.ui.open({ id: PANE, title: 'Painel', columns: 36 })
}

async function refreshCost($: any) {
  const u = await $.session.usage()
  await update($, panel, (p: Panel) => ({ ...p, costUsd: u.cost?.usd ?? p.costUsd }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'painel', description: 'Abre o painel lateral de custo, tokens e agentes' })
    void open($)
    return next(e)
  })

  on('command.run', { command: 'painel' }, async $ => {
    await open($)
    return { text: 'Painel aberto.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny === undefined && r.agentId) {
      const id = r.agentId
      await update($, panel, (p: Panel) => patch(p, id, a => ({ ...a, label: e.description || e.subagentType, kind: e.subagentType })))
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const detail = (e as any).file_path ?? (e as any).command ?? (e as any).pattern ?? (e as any).description ?? ''
    await update($, panel, (p: Panel) => patch(p, id, a => ({
      ...a, activity: [...a.activity, `${e.tool} ${String(detail).split('\n')[0].slice(0, 80)}`].slice(-60),
    })))

    const path: string | undefined = e.tool === 'Write' ? (e as any).file_path : undefined
    const existed = path ? await $.fs.exists(path).catch(() => true) : true
    const ran = await next(e)
    const ok = ran.deny === undefined && ran.isError !== true

    if (ok && path && !existed) {
      await update($, panel, (p: Panel) => patch(p, id, a => ({ ...a, created: push(a.created, path) })))
    }
    if (ok && e.tool === 'Bash') {
      const gone = removed((e as any).command ?? '')
      if (gone.length) {
        await update($, panel, (p: Panel) => patch(p, id, a => ({ ...a, deleted: gone.reduce((l, f) => push(l, f), a.deleted) })))
      }
    }
    await refreshCost($)
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    const n = u ? u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : 0
    const id = e.agentId ?? MAIN
    await update($, panel, (p: Panel) => {
      const q = patch(p, id, a => ({ ...a, tokens: a.tokens + n, isDone: id !== MAIN }))
      return { ...q, tokens: q.tokens + n }
    })
    await refreshCost($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const p = await read($, panel)
    const choose = (id: string | null) => update($, panel, (q: Panel) => ({ ...q, selected: id }))
    const sel = p.selected ? p.agents[p.selected] : undefined

    const label = (t: string, n?: number) => (
      <Text dimColor bold>{t.toUpperCase()}{n === undefined ? '' : `  ${n}`}</Text>
    )
    const card = (children: any) => (
      <Box flexDirection="column" marginTop={1} paddingX={1} borderStyle="round">
        {children}
      </Box>
    )
    const files = (title: string, list: string[], color: string, mark: string) =>
      card(
        <Box flexDirection="column">
          {label(title, list.length)}
          {list.length === 0 && <Text dimColor>nenhum</Text>}
          {list.slice(-15).map(f => <Text color={color}>{mark} {f}</Text>)}
        </Box>,
      )

    if (sel) {
      return (
        <Box flexDirection="column">
          <Button key="voltar" label="‹ Voltar" onPress={() => choose(null)} />
          <Text bold>{sel.label}</Text>
          <Text dimColor>{sel.kind} · <Text color={sel.isDone ? undefined : C.ok}>{sel.isDone ? 'concluído' : 'ativo'}</Text> · {fmt(sel.tokens)} tokens</Text>
          {card(
            <Box flexDirection="column">
              {label('Atividade')}
              {sel.activity.length === 0 && <Text dimColor>nada ainda</Text>}
              {sel.activity.slice(-12).reverse().map(a => <Text>{a}</Text>)}
            </Box>,
          )}
          {files('Arquivos criados', sel.created, C.ok, '+')}
          {files('Arquivos deletados', sel.deleted, C.bad, '−')}
        </Box>
      )
    }

    const active = p.order.filter(id => !p.agents[id].isDone)
    const all = (k: 'created' | 'deleted') =>
      p.order.reduce<string[]>((l, id) => p.agents[id][k].reduce((m, f) => push(m, f, 500), l), [])

    return (
      <Box flexDirection="column">
        {card(
          <Box flexDirection="column">
            {label('Custo da sessão')}
            <Text bold>US$ {p.costUsd.toFixed(4)}</Text>
          </Box>,
        )}
        {card(
          <Box flexDirection="column">
            {label('Tokens usados')}
            <Text bold>{fmt(p.tokens)}</Text>
          </Box>,
        )}
        {card(
          <Box flexDirection="column">
            {label('Agentes ativos', active.length)}
            {p.order.length === 0 && <Text dimColor>nenhum ainda</Text>}
            {p.order.map(id => {
              const a = p.agents[id]
              return (
                <Button key={`ag-${id}`} onPress={() => choose(id)}>
                  <Text color={a.isDone ? undefined : C.ok} dimColor={a.isDone}>● </Text>
                  <Text dimColor={a.isDone}>{a.label} </Text>
                  <Text dimColor>{fmt(a.tokens)}</Text>
                </Button>
              )
            })}
          </Box>,
        )}
        {files('Arquivos criados', all('created'), C.ok, '+')}
        {files('Arquivos deletados', all('deleted'), C.bad, '−')}
      </Box>
    )
  })
}
