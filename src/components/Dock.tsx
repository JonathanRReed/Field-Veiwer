import { memo } from 'react'
import type { GameLoop, Tool } from '../engine/gameLoop'
import { useLoopState } from '../hooks/useGameLoop'
import { formatNumber } from '../utils/format'
import { ClearIcon, PauseIcon, PlayIcon, ResetIcon, StepIcon } from './icons'

const TOOLS: { key: Tool; label: string; shortcut: string }[] = [
  { key: 'select', label: 'Select', shortcut: '1' },
  { key: 'electron', label: 'Electron', shortcut: '2' },
  { key: 'positron', label: 'Positron', shortcut: '3' },
  { key: 'photon', label: 'Photon', shortcut: '4' }
]

const Clock = ({ loop }: { loop: GameLoop }) => {
  const { time } = useLoopState(loop)
  return (
    <p className="clock" aria-label="Simulation time">
      <i>t</i> = {formatNumber(time, 3)}
    </p>
  )
}

interface DockProps {
  loop: GameLoop
  running: boolean
  tool: Tool
  onTool: (tool: Tool) => void
  timeScale: number
  onTimeScale: (value: number) => void
  showTraces: boolean
  onShowTraces: (value: boolean) => void
}

export const Dock = memo(
  ({ loop, running, tool, onTool, timeScale, onTimeScale, showTraces, onShowTraces }: DockProps) => (
    <footer className="dock">
      <div className="dock-group dock-tools" role="toolbar" aria-label="Packet tool">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tool tool--${t.key}`}
            aria-pressed={tool === t.key}
            aria-keyshortcuts={t.shortcut}
            onClick={() => onTool(t.key)}
          >
            <span className="swatch" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="dock-group dock-transport" role="group" aria-label="Playback">
        <button
          type="button"
          className="icon-button icon-button--primary"
          aria-label={running ? 'Pause' : 'Play'}
          title={running ? 'Pause (Space)' : 'Play (Space)'}
          aria-keyshortcuts="Space"
          onClick={() => loop.togglePlay()}
        >
          {running ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Step one tick"
          title="Step one tick while paused (S)"
          aria-keyshortcuts="S"
          disabled={running}
          onClick={() => loop.step()}
        >
          <StepIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Reset preset"
          title="Reset the preset (R)"
          aria-keyshortcuts="R"
          onClick={() => loop.reset()}
        >
          <ResetIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Clear all packets"
          title="Clear all packets"
          onClick={() => loop.clearAll()}
        >
          <ClearIcon />
        </button>
        <Clock loop={loop} />
      </div>

      <div className="dock-group dock-speed">
        <label className="speed">
          <span>
            speed <output>{timeScale.toFixed(1)}×</output>
          </span>
          <input
            type="range"
            aria-label="Playback speed"
            min={0.1}
            max={2}
            step={0.1}
            value={timeScale}
            onChange={(event) => onTimeScale(Number(event.target.value))}
          />
        </label>
        <label className="check-toggle">
          <input type="checkbox" checked={showTraces} onChange={(event) => onShowTraces(event.target.checked)} />
          trails
        </label>
      </div>
    </footer>
  )
)
Dock.displayName = 'Dock'
