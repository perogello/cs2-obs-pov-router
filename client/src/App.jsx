import React, { useCallback, useEffect, useRef, useState } from 'react'
import readXlsxFile from 'read-excel-file/browser'

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
  const [roster, setRoster] = useState([])
  const [mapping, setMapping] = useState({})
  const [state, setState] = useState({})
  const [selectedSource, setSelectedSource] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [selectedRosterPlayer, setSelectedRosterPlayer] = useState('')
  const [manualSteamId, setManualSteamId] = useState('')
  const [rosterName, setRosterName] = useState('')
  const [rosterSteamId, setRosterSteamId] = useState('')
  const [editingRosterSteamId, setEditingRosterSteamId] = useState('')
  const [editRosterName, setEditRosterName] = useState('')
  const [editRosterSteamId, setEditRosterSteamId] = useState('')
  const [editingSteamId, setEditingSteamId] = useState('')
  const [editSteamId, setEditSteamId] = useState('')
  const [editSource, setEditSource] = useState('')
  const [showSteam, setShowSteam] = useState(false)
  const [wsAlive, setWsAlive] = useState(false)
  const lastPing = useRef(Date.now())
  const importRosterRef = useRef(null)

  const fetchBasics = useCallback(async () => {
    const [s, m, st, r] = await Promise.all([
      fetch('/api/sources').then((res) => res.json()),
      fetch('/api/mapping').then((res) => res.json()),
      fetch('/api/state').then((res) => res.json()),
      fetch('/api/roster').then((res) => res.json())
    ])
    setSources(s)
    setMapping(m)
    setState(st)
    setRoster(r)
    if (!selectedSource && s.length) setSelectedSource(s[0].key)
  }, [selectedSource])

  usePolling(fetchBasics, 1000)

  useEffect(() => {
    let ws
    let reconnectTimer
    function connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      ws.onopen = () => setWsAlive(true)
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'players') setPlayers(msg.players || [])
          else if (msg.type === 'roster') setRoster(msg.roster || [])
          else if (msg.type === 'state') setState((s) => ({ ...s, ...msg }))
          else if (msg.type === 'mapping') setMapping(msg.mapping || {})
          else if (msg.type === 'ping') lastPing.current = Date.now()
        } catch {}
      }
      ws.onclose = () => {
        setWsAlive(false)
        reconnectTimer = setTimeout(connect, 1500)
      }
      ws.onerror = () => {
        try {
          ws.close()
        } catch {}
      }
    }
    connect()
    const heartbeatTimer = setInterval(
      () => setWsAlive(Date.now() - lastPing.current < 5000),
      1000
    )
    return () => {
      clearInterval(heartbeatTimer)
      clearTimeout(reconnectTimer)
      try {
        ws && ws.close()
      } catch {}
    }
  }, [])

  async function bindSelected() {
    const steamid = manualSteamId.trim() || selectedRosterPlayer || selectedPlayer
    if (!selectedSource || !steamid) return
    await fetch('/api/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steamid, source: selectedSource })
    })
    setManualSteamId('')
  }

  function chooseRosterPlayer(steamid) {
    setSelectedRosterPlayer(steamid)
    if (steamid) {
      setSelectedPlayer('')
      setManualSteamId('')
    }
  }

  function chooseLivePlayer(steamid) {
    setSelectedPlayer(steamid)
    if (steamid) {
      setSelectedRosterPlayer('')
      setManualSteamId('')
    }
  }

  function changeManualSteamId(value) {
    setManualSteamId(value)
    if (value.trim()) {
      setSelectedRosterPlayer('')
      setSelectedPlayer('')
    }
  }

  async function bindNext() {
    if (!selectedSource) return
    await fetch('/api/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: selectedSource })
    })
  }

  async function forceSwitch(src) {
    if (!src) return
    await fetch('/api/force', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: src })
    })
  }

  async function addRosterPlayer() {
    if (!rosterName.trim() || !rosterSteamId.trim()) return
    const res = await fetch('/api/roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: rosterName.trim(), steamid: rosterSteamId.trim() })
    })
    if (res.ok) {
      setRosterName('')
      setRosterSteamId('')
    }
  }

  function exportRoster() {
    const blob = new Blob([JSON.stringify(roster, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'players_db.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function parseRosterCsv(text) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[;,]/).map((part) => part.trim())
        const [steamid, name] = parts[0]?.match(/^\d{17}$/) ? parts : [parts[1], parts[0]]
        return { steamid, name }
      })
  }

  async function parseRosterXlsx(file) {
    const rows = await readXlsxFile(file)
    return rows
      .map((row) => row.map((cell) => String(cell || '').trim()))
      .filter((row) => row.some(Boolean))
      .map((row, index) => {
        const lower = row.map((cell) => cell.toLowerCase())
        if (index === 0 && lower.some((cell) => ['steamid', 'steamid64', 'steam id', 'name', 'nickname', 'nick'].includes(cell))) {
          return null
        }

        const steamIndex = row.findIndex((cell) => /^\d{17}$/.test(cell))
        const steamid = steamIndex >= 0 ? row[steamIndex] : ''
        const name = row.find((cell, cellIndex) => cellIndex !== steamIndex && cell && !/^\d{17}$/.test(cell)) || ''
        return { steamid, name }
      })
      .filter(Boolean)
  }

  async function importRosterFile(file) {
    if (!file) return
    let players

    if (file.name.toLowerCase().endsWith('.xlsx')) {
      players = await parseRosterXlsx(file)
    } else {
      const text = await file.text()
      try {
        const parsed = JSON.parse(text)
        players = Array.isArray(parsed)
          ? parsed
          : Object.entries(parsed).map(([steamid, name]) => ({ steamid, name }))
      } catch {
        players = parseRosterCsv(text)
      }
    }

    const res = await fetch('/api/roster/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'merge', players })
    })

    if (res.ok) fetchBasics()
    if (importRosterRef.current) importRosterRef.current.value = ''
  }

  function startRosterEdit(player) {
    setEditingRosterSteamId(player.steamid)
    setEditRosterName(player.name)
    setEditRosterSteamId(player.steamid)
  }

  function cancelRosterEdit() {
    setEditingRosterSteamId('')
    setEditRosterName('')
    setEditRosterSteamId('')
  }

  async function saveRosterEdit() {
    if (!editingRosterSteamId || !editRosterName.trim() || !editRosterSteamId.trim()) return
    const res = await fetch('/api/roster/' + encodeURIComponent(editingRosterSteamId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editRosterName.trim(), steamid: editRosterSteamId.trim() })
    })
    if (res.ok) cancelRosterEdit()
  }

  async function removeRosterPlayer(steamid) {
    await fetch('/api/roster/' + encodeURIComponent(steamid), { method: 'DELETE' })
  }

  async function removeBind(steamid) {
    await fetch('/api/mapping/' + encodeURIComponent(steamid), { method: 'DELETE' })
  }

  function startEdit(steamid, source) {
    setEditingSteamId(steamid)
    setEditSteamId(steamid)
    setEditSource(source)
  }

  function cancelEdit() {
    setEditingSteamId('')
    setEditSteamId('')
    setEditSource('')
  }

  async function saveEdit() {
    const steamid = editSteamId.trim()
    if (!editingSteamId || !steamid || !editSource) return
    const res = await fetch('/api/mapping/' + encodeURIComponent(editingSteamId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steamid, source: editSource })
    })
    if (res.ok) cancelEdit()
  }

  const playerLabel = (sid) =>
    roster.find((p) => p.steamid === sid)?.name ||
    players.find((p) => p.steamid === sid)?.name ||
    sid

  const isSavedPlayer = (steamid) => roster.some((p) => p.steamid === steamid)
  const sourceLabel = (sourceRef) => {
    const source = sources.find((s) => s.key === sourceRef || s.sourceName === sourceRef)
    return source ? `${source.sourceName} [${source.sceneName}]` : sourceRef
  }

  const bindDisabled =
    !selectedSource || (!selectedPlayer && !selectedRosterPlayer && !manualSteamId.trim())

  return (
    <div className='container'>
      <h1>CS2 to OBS Router</h1>

      <div className='card'>
        <div className='status-row'>
          <div><b>Scene:</b> <span className='small'>{state.scene || '-'}</span></div>
          <div><b>Last SteamID:</b> <span className='small'>{state.lastSteamId || '-'}</span></div>
          <div><b>OBS:</b> <span className='small'>{state.obsConnected ? 'connected' : 'offline'}</span></div>
          <div><b>Bind next:</b> <span className='small'>{state.pendingBindSource || '-'}</span></div>
          <div className={'status ' + (wsAlive ? 'ok' : 'bad')}>
            WS: {wsAlive ? 'connected' : 'reconnecting...'}
          </div>
          <label>
            <input type='checkbox' checked={showSteam} onChange={(e) => setShowSteam(e.target.checked)} /> Show SteamIDs
          </label>
        </div>
      </div>

      <div className='card'>
        <h3>Player database</h3>
        <div className='toolbar'>
          <input className='text-input' value={rosterName} onChange={(e) => setRosterName(e.target.value)} placeholder='Nickname' />
          <input className='text-input' value={rosterSteamId} onChange={(e) => setRosterSteamId(e.target.value)} placeholder='SteamID64' />
          <button className='button primary' onClick={addRosterPlayer} disabled={!rosterName.trim() || !rosterSteamId.trim()}>
            Add player
          </button>
          <button className='button' onClick={exportRoster} disabled={!roster.length}>Export</button>
          <button className='button' onClick={() => importRosterRef.current?.click()}>Import</button>
          <input
            ref={importRosterRef}
            type='file'
            accept='.json,.csv,.xlsx,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            style={{ display: 'none' }}
            onChange={(e) => importRosterFile(e.target.files?.[0])}
          />
        </div>
        <table className='table'>
          <thead>
            <tr>
              <th>Nickname</th>
              <th>SteamID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => (
              <tr key={p.steamid} className='row-saved'>
                <td>
                  {editingRosterSteamId === p.steamid ? (
                    <input className='text-input compact' value={editRosterName} onChange={(e) => setEditRosterName(e.target.value)} />
                  ) : (
                    <>
                      {p.name}
                      <span className='badge saved'>saved</span>
                    </>
                  )}
                </td>
                <td>
                  {editingRosterSteamId === p.steamid ? (
                    <input className='text-input compact' value={editRosterSteamId} onChange={(e) => setEditRosterSteamId(e.target.value)} />
                  ) : p.steamid}
                </td>
                <td>
                  {editingRosterSteamId === p.steamid ? (
                    <>
                      <button className='button primary' onClick={saveRosterEdit}>Save</button>
                      <button className='button' onClick={cancelRosterEdit}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className='button' onClick={() => startRosterEdit(p)}>Edit</button>
                      <button className='button' onClick={() => removeRosterPlayer(p.steamid)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className='card'>
        <h3>Bind / Force</h3>
        <div className='toolbar'>
          <select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)}>
            <option value=''>- select source -</option>
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.sourceName} [{s.sceneName}]
              </option>
            ))}
          </select>
          <select value={selectedRosterPlayer} onChange={(e) => chooseRosterPlayer(e.target.value)}>
            <option value=''>- saved player -</option>
            {roster.map((p) => (
              <option key={p.steamid} value={p.steamid}>
                {p.name} ({p.steamid})
              </option>
            ))}
          </select>
          <select value={selectedPlayer} onChange={(e) => chooseLivePlayer(e.target.value)}>
            <option value=''>- live player -</option>
            {players.map((p) => (
              <option key={p.steamid} value={p.steamid}>
                {p.name || p.steamid}
              </option>
            ))}
          </select>
          <input className='text-input' value={manualSteamId} onChange={(e) => changeManualSteamId(e.target.value)} placeholder='Manual SteamID64' />
          <button className='button' onClick={bindSelected} disabled={bindDisabled}>Bind</button>
          <button className='button' onClick={bindNext} disabled={!selectedSource}>Bind next</button>
          <button className='button primary' onClick={() => forceSwitch(selectedSource)} disabled={!selectedSource}>Force</button>
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
                <td>
                  {editingSteamId === sid ? (
                    <input className='text-input compact' value={editSteamId} onChange={(e) => setEditSteamId(e.target.value)} />
                  ) : (
                    <>
                      {showSteam ? sid : playerLabel(sid)}
                      <span className={'badge ' + (isSavedPlayer(sid) ? 'saved' : 'live')}>
                        {isSavedPlayer(sid) ? 'saved' : 'live'}
                      </span>
                    </>
                  )}
                </td>
                <td>
                  {editingSteamId === sid ? (
                    <select value={editSource} onChange={(e) => setEditSource(e.target.value)}>
                      {sources.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.sourceName} [{s.sceneName}]
                        </option>
                      ))}
                      {!sources.some((s) => s.key === editSource || s.sourceName === editSource) && <option value={editSource}>{editSource}</option>}
                    </select>
                  ) : sourceLabel(src)}
                </td>
                <td>
                  {editingSteamId === sid ? (
                    <>
                      <button className='button primary' onClick={saveEdit}>Save</button>
                      <button className='button' onClick={cancelEdit}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className='button' onClick={() => startEdit(sid, src)}>Edit</button>
                      <button className='button' onClick={() => forceSwitch(src)}>Force</button>
                      <button className='button' onClick={() => removeBind(sid)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className='card'>
        <h3>All known live players</h3>
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
              <tr key={p.steamid} className={isSavedPlayer(p.steamid) ? 'row-saved' : 'row-live'}>
                <td>{p.steamid}</td>
                <td>
                  {p.name || '-'}
                  <span className={'badge ' + (isSavedPlayer(p.steamid) ? 'saved' : 'live')}>
                    {isSavedPlayer(p.steamid) ? 'saved' : 'live'}
                  </span>
                </td>
                <td>{new Date(p.lastSeen).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
