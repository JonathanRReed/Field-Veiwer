import { useCallback, useEffect, useState } from 'react'
import { AboutPage } from './components/AboutPage'
import { Dock } from './components/Dock'
import { BrandMark, SlidersIcon } from './components/icons'
import { LabStage } from './components/LabStage'
import { SettingsPanel } from './components/SettingsPanel'
import { PRESET_ORDER, presetGuides } from './content/explainer'
import type { Tool } from './engine/gameLoop'
import { gameLoop } from './engine/gameLoopSingleton'
import { useLoopRunning } from './hooks/useGameLoop'
import {
  DEFAULT_ANNIHILATION_MODE,
  DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE_DEGREES
} from './simulation/constants'
import type { AnnihilationMode } from './types/particle'
import type { PresetId } from './types/simulation'

type View = 'lab' | 'about'

const INTRO_KEY = 'fv.coach.v1'
const TOOL_KEYS: Record<string, Tool> = { '1': 'select', '2': 'electron', '3': 'positron', '4': 'photon' }

const introAlreadySeen = (): boolean => {
  try {
    // Touch screens have no Space key and little room for a hint, so skip it there.
    if (window.matchMedia('(hover: none)').matches) return true
    return window.localStorage.getItem(INTRO_KEY) === '1'
  } catch {
    return false
  }
}

const isFormTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  Boolean(target.closest('a, button, input, select, textarea, [contenteditable="true"], [role="button"]'))

export default function App() {
  const [view, setView] = useState<View>('lab')
  const [presetId, setPresetId] = useState<PresetId>('annihilation')
  const [tool, setTool] = useState<Tool>('select')
  const [timeScale, setTimeScale] = useState(1)
  const [showTraces, setShowTraces] = useState(false)
  const [mode, setMode] = useState<AnnihilationMode>(DEFAULT_ANNIHILATION_MODE)
  const [angle, setAngle] = useState(DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE_DEGREES)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showIntro, setShowIntro] = useState(() => !introAlreadySeen())
  const running = useLoopRunning(gameLoop)

  const dismissIntro = useCallback(() => {
    setShowIntro(false)
    try {
      window.localStorage.setItem(INTRO_KEY, '1')
    } catch {
      /* storage can be unavailable in private windows */
    }
  }, [])

  useEffect(() => gameLoop.setTimeScale(timeScale), [timeScale])
  useEffect(() => gameLoop.setShowTraces(showTraces), [showTraces])
  useEffect(() => gameLoop.setTool(tool), [tool])
  useEffect(() => gameLoop.setAnnihilationMode(mode), [mode])
  useEffect(() => gameLoop.setAnnihilationAngleDegrees(angle), [angle])
  useEffect(() => {
    if (running) dismissIntro()
  }, [running, dismissIntro])

  const chooseTool = useCallback(
    (next: Tool) => {
      setTool(next)
      dismissIntro()
    },
    [dismissIntro]
  )

  useEffect(() => {
    if (view !== 'lab' || settingsOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isFormTarget(event.target)) return
      const key = event.key.toLowerCase()
      if (key === ' ') {
        event.preventDefault()
        gameLoop.togglePlay()
      } else if (key === 's') gameLoop.step()
      else if (key === 'r') gameLoop.reset()
      else if (key === 'escape') gameLoop.deselectAll()
      else if (key in TOOL_KEYS) chooseTool(TOOL_KEYS[key])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, settingsOpen, chooseTool])

  const loadPreset = (id: PresetId) => {
    setPresetId(id)
    gameLoop.loadPreset(id)
  }

  const openLab = (preset?: PresetId) => {
    if (preset) loadPreset(preset)
    setView('lab')
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          {view === 'lab' ? (
            <h1 className="brand-name">Field Viewer</h1>
          ) : (
            <span className="brand-name">Field Viewer</span>
          )}
        </div>

        {view === 'lab' ? (
          <nav className="presets" aria-label="Presets">
            {PRESET_ORDER.map((id) => (
              <button key={id} type="button" aria-pressed={presetId === id} onClick={() => loadPreset(id)}>
                {presetGuides[id].title}
              </button>
            ))}
          </nav>
        ) : null}

        <nav className="sections" aria-label="Site sections">
          <button type="button" aria-current={view === 'lab' ? 'page' : undefined} onClick={() => setView('lab')}>
            Lab
          </button>
          <button type="button" aria-current={view === 'about' ? 'page' : undefined} onClick={() => setView('about')}>
            About
          </button>
          {view === 'lab' ? (
            <button
              type="button"
              className="icon-button"
              aria-label="Annihilation settings"
              title="Annihilation settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <SlidersIcon />
            </button>
          ) : null}
        </nav>
      </header>

      {view === 'lab' ? (
        <>
          <LabStage loop={gameLoop} tool={tool} showIntro={showIntro} onFirstInteraction={dismissIntro} />
          <Dock
            loop={gameLoop}
            running={running}
            tool={tool}
            onTool={chooseTool}
            timeScale={timeScale}
            onTimeScale={setTimeScale}
            showTraces={showTraces}
            onShowTraces={setShowTraces}
          />
          {settingsOpen ? (
            <SettingsPanel
              mode={mode}
              onMode={setMode}
              angle={angle}
              onAngle={setAngle}
              onClose={() => setSettingsOpen(false)}
            />
          ) : null}
        </>
      ) : (
        <AboutPage onOpenLab={openLab} />
      )}
    </div>
  )
}
