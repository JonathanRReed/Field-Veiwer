import { useEffect, useState } from 'react'
import { PRESET_ORDER, claims, limitations, presetGuides, sources } from '../content/explainer'
import { GameLoop } from '../engine/gameLoop'
import type { PresetId } from '../types/simulation'
import { FieldStage } from './FieldStage'

const REPLAY_DELAY_MS = 3200

/** A looping, read-only annihilation with its own loop, so it never touches the lab. */
const Demo = () => {
  const [loop] = useState(() => new GameLoop())

  useEffect(() => {
    loop.loadPreset('annihilation')
    loop.setTimeScale(0.8)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    let replay: ReturnType<typeof setTimeout> | undefined
    const onState = (state: ReturnType<GameLoop['snapshot']>) => {
      if (!state.lastAnnihilation || replay) return
      replay = setTimeout(() => {
        replay = undefined
        loop.loadPreset('annihilation')
      }, REPLAY_DELAY_MS)
    }
    loop.onStateChange(onState)
    loop.play()
    return () => {
      clearTimeout(replay)
      loop.pause()
      loop.offStateChange(onState)
    }
  }, [loop])

  return (
    <div
      className="demo"
      role="img"
      aria-label="Looping demo. An electron and a positron meet on the electron field and two photons appear on the photon field."
    >
      <FieldStage loop={loop} interactive={false} />
    </div>
  )
}

const Keys = () => (
  <dl className="keys">
    <div>
      <dt>
        <kbd>Space</kbd>
      </dt>
      <dd>Play or pause</dd>
    </div>
    <div>
      <dt>
        <kbd>S</kbd>
      </dt>
      <dd>Step one tick while paused</dd>
    </div>
    <div>
      <dt>
        <kbd>R</kbd>
      </dt>
      <dd>Reset the preset</dd>
    </div>
    <div>
      <dt>
        <kbd>1</kbd> to <kbd>4</kbd>
      </dt>
      <dd>Select, electron, positron, photon</dd>
    </div>
    <div>
      <dt>
        <kbd>Esc</kbd>
      </dt>
      <dd>Deselect, or close settings</dd>
    </div>
  </dl>
)

interface AboutPageProps {
  onOpenLab: (preset?: PresetId) => void
}

export const AboutPage = ({ onOpenLab }: AboutPageProps) => (
  <main className="about" id="main-content" tabIndex={-1}>
    <section className="about-hero" aria-labelledby="about-title">
      <div className="about-hero-copy">
        <h1 id="about-title">A particle is a wave packet.</h1>
        <p className="lede">
          Field Viewer draws electrons, positrons, and photons as bumps on two fields. When an
          electron and a positron meet, it shows the conservation math for what comes out.
        </p>
        <div className="about-actions">
          <button type="button" className="button button--primary" onClick={() => onOpenLab()}>
            Open the lab
          </button>
          <p className="fine-print">
            Runs in your browser. No accounts and no cookies. Cloudflare may count page views.
          </p>
        </div>
      </div>
      <Demo />
    </section>

    <section className="about-section" aria-labelledby="experiments-title">
      <h2 id="experiments-title">Three experiments</h2>
      <ul className="experiments">
        {PRESET_ORDER.map((id) => {
          const guide = presetGuides[id]
          return (
            <li key={id} className="experiment">
              <div className="experiment-intro">
                <h3>{guide.title}</h3>
                <p>{guide.objective}</p>
                <button type="button" className="button" onClick={() => onOpenLab(id)}>
                  Load in the lab
                </button>
              </div>
              <ol className="experiment-steps">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <ul className="experiment-checks" aria-label={`What to confirm in ${guide.title}`}>
                {guide.checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </section>

    <section className="about-section prose" aria-labelledby="picture-title">
      <h2 id="picture-title">Reading the picture</h2>
      <p>
        The top slab is the electron field. An electron is a localized bump in it, with a position
        and a momentum. Every electron comes from the same template, with the same mass, charge,
        and spin label. Click two of them and the readouts match except for position and momentum.
        That is the point I wanted this page to make.
      </p>
      <p>
        The bottom slab is the photon field. A positron lives on the top slab too, because it is
        the electron field with the charge flipped. When an electron and a positron overlap, the
        app removes both and creates two photon packets below. The event card then shows energy
        and momentum before and after, the invariant mass √s, and one check per conserved
        quantity. A check passes when its residual is under 10⁻¹⁰. If a check fails, that's a bug
        in my code.
      </p>
      <ul className="plain-list">
        <li>Units are set so c = mₑ = 1. Physics steps 120 times per second at 1× speed.</li>
        <li>Each field wraps at its edges, so a packet that leaves one side returns on the other.</li>
        <li>Fast electrons are drawn squeezed along their direction of motion.</li>
        <li>
          Annihilation runs in one of two modes. Center of momentum sends the photons out back to
          back in the pair's rest frame at a chosen angle, then boosts them to the lab. Collinear
          sends both along the line of the total momentum.
        </li>
      </ul>
    </section>

    <section className="about-section" aria-labelledby="controls-title">
      <h2 id="controls-title">Controls</h2>
      <p className="prose-line">
        Pick a tool in the dock and drag on a field to launch a packet. The drag sets its
        momentum. With Select active, click a packet to read it and steer it, or drag it to move
        it.
      </p>
      <Keys />
    </section>

    <section className="about-section" aria-labelledby="scope-title">
      <h2 id="scope-title">Scope</h2>
      <div className="scope">
        <div>
          <h3>What it claims</h3>
          <ul className="plain-list">
            {claims.map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>What it skips</h3>
          <ul className="plain-list">
            {limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>

    <section className="about-section" aria-labelledby="sources-title">
      <h2 id="sources-title">Sources</h2>
      <ul className="sources">
        {sources.map((source) => (
          <li key={source.doi}>
            {source.author} ({source.year}). {source.title}. <em>{source.venue}</em>.{' '}
            <a href={`https://doi.org/${source.doi}`} rel="noopener noreferrer" target="_blank">
              doi.org/{source.doi}
            </a>
          </li>
        ))}
      </ul>
    </section>

    <section className="about-section about-author" aria-label="Author">
      <p>
        I built this to see whether a physics demo could be honest about what it leaves out. It is
        a teaching sketch, not a research tool.
      </p>
      <p>
        <a href="https://jonathanrreed.com/" rel="author external noopener noreferrer" target="_blank">
          Jonathan R. Reed
        </a>
      </p>
    </section>
  </main>
)
