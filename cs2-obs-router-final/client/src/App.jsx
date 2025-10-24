import React, { useCallback, useEffect, useRef, useState } from 'react'

function usePolling(fn, interval = 1000) {
  useEffect(() => {
    let active = true
    ;(async () => {
      while (active) {
        try {
          await fn()
        } catch {}
        await new Promise((r) => setTimeout(r, interval))
      }
    })()
    return () => {
      active = false
    }
  }, [fn, interval])
}

export default function App() {
  const [sources, setSources] = useState([])
  const [players, setPlayers] = useState([])
  const [mapping, setMapping] = useState({})
  const [state, setState] = useState({})
  const [selectedSource, setSelectedSource] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [showSteam, setShowSteam] = useState(false)
  const [wsAlive, setWsAlive] = useState(false)
  const lastPing = useRef(Date.now())

  const fetchBasics = useCallback(async () => {
    const [s, m, st] = await Promise.all([
      fetch('/api/sources').then((r) => r.json()),
      fetch('/api/mapping').then((r) => r.json()),
      fetch('/api/state').then((r) => r.json())
    ])
    setSources(s)
    setMapping(m)
    setState(st)
    if (!selectedSource && s.length) setSelectedSource(s[0].sourceName)
  }, [selectedSource])

  // обновление каждые 1 секунду
  usePolling(fetchBasics, 1000)

  // WebSocket + авто-переподключение + heartbeat
  useEffect(() => {
    let ws
    function connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      ws.onopen = () => setWsAlive(true)
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'players') setPlayers(msg.players || [])
          else if (msg.type === 'state') setState((s) => ({ ...s, ...msg }))
          else if (msg.type === 'mapping') setMapping(msg.mapping || {})
          else if (msg.type === 'ping') lastPing.current = Date.now()
        } catch {}
      }
      ws.onclose = () => {
        setWsAlive(false)
        setTimeout(connect, 1500)
      }
      ws.onerror = () => {
        try {
          ws.close()
        } catch {}
      }
    }
    connect()
    const t = setInterval(
      () => setWsAlive(Date.now() - lastPing.current < 5000),
      1000
    )
    return () => {
      clearInterval(t)
      try {
        ws && ws.close()
      } catch {}
    }
  }, [])

  async function bindSelected() {
    if (!selectedSource || !selectedPlayer)
      return alert('Select a source and a player')
    await fetch('/api/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steamid: selectedPlayer, source: selectedSource })
    })
  }

  async function bindNext() {
    if (!selectedSource) return alert('Select a source first')
    await fetch('/api/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: selectedSource })
    })
    alert(
      'Bind mode ON. Switch to the desired player in CS2 to capture their SteamID.'
    )
  }

  async function forceSwitch(src) {
    await fetch('/api/force', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: src })
    })
  }

  async function removeBind(steamid) {
    await fetch('/api/mapping/' + encodeURIComponent(steamid), {
      method: 'DELETE'
    })
  }

  const playerLabel = (sid) =>
    players.find((p) => p.steamid === sid)?.name || sid

  return (
    <div className='container'>
      <h1>CS2 → OBS Router (FAST)</h1>

      <div className='card'>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div>
            <b>Scene:</b> <span className='small'>{state.scene}</span>
          </div>
          <div>
            <b>Last SteamID:</b>{' '}
            <span className='small'>{state.lastSteamId || '—'}</span>
          </div>
          <div
            className={'status ' + (wsAlive ? 'ok' : 'bad')}
            style={{ marginLeft: 'auto' }}
          >
            WS: {wsAlive ? 'connected' : 'reconnecting…'}
          </div>
          <div>
            <label>
              <input
                type='checkbox'
                checked={showSteam}
                onChange={(e) => setShowSteam(e.target.checked)}
              />{' '}
              Show SteamIDs
            </label>
          </div>
        </div>
      </div>

      <div className='card'>
        <h3>Bind / Force</h3>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 8
          }}
        >
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
          >
            {sources.map((s) => (
              <option key={s.sourceName} value={s.sourceName}>
                {s.sourceName} [{s.sceneName}]
              </option>
            ))}
          </select>
          <select
            value={selectedPlayer}
            onChange={(e) => setSelectedPlayer(e.target.value)}
          >
            <option value=''>— select player —</option>
            {players.map((p) => (
              <option key={p.steamid} value={p.steamid}>
                {p.name || p.steamid}
              </option>
            ))}
          </select>
          <button className='button' onClick={bindSelected}>
            Bind selected
          </button>
          <button className='button' onClick={bindNext}>
            Bind next (auto)
          </button>
          <button className='button primary' onClick={() => forceSwitch(selectedSource)}>
            Force
          </button>
        </div>
      </div>

      <div className='card'>
        <h3>Current mapping</h3>
        <table className='table'>
          <thead>
            <tr>
              <th>Player</th>
              <th>Source</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(mapping).map(([sid, src]) => (
              <tr key={sid}>
                <td>{showSteam ? sid : playerLabel(sid)}</td>
                <td>{src}</td>
                <td>
                  <button className='button' onClick={() => forceSwitch(src)}>
                    Force
                  </button>
                  <button className='button' onClick={() => removeBind(sid)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className='card'>
        <h3>All known players</h3>
        <table className='table'>
          <thead>
            <tr>
              <th>SteamID</th>
              <th>Name</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.steamid}>
                <td>{p.steamid}</td>
                <td>{p.name || '—'}</td>
                <td>{new Date(p.lastSeen).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
