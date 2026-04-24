import { describe, expect, test } from 'vitest'
import { defaultPresetId, getPreset } from '../src/simulation/presets'
import { electronDefaults, positronDefaults } from '../src/simulation/physics'
import { PHOTON_MASS_SIM } from '../src/simulation/constants'
import { stepSimulation } from '../src/simulation/engine'

describe('preset generation', () => {
  test('uniformity creates many electron excitations with identical intrinsic values', () => {
    const state = getPreset('uniformity').state
    const electrons = state.excitations.filter((entry) => entry.field === 'electron' && entry.alive)

    expect(electrons.length).toBeGreaterThanOrEqual(3)
    electrons.forEach((entry) => {
      expect(entry.mass).toBe(electronDefaults.mass)
      expect(entry.spinLabel).toBe(electronDefaults.spinLabel)
      expect(entry.charge).toBe(electronDefaults.charge)
    })
  })

  test('mirror creates opposite charge pair with same mass and spin', () => {
    const state = getPreset('mirror').state
    const electrons = state.excitations.filter((entry) => entry.field === 'electron')

    expect(electrons).toHaveLength(2)
    const first = electrons[0]
    const second = electrons[1]
    expect(first.spinLabel).toBe(second.spinLabel)
    expect(first.mass).toBe(second.mass)
    expect(first.charge).toBe(-second.charge)
    expect(first.kind).not.toBe(second.kind)
  })

  test('annihilation preset starts with electron and positron in opposite charges', () => {
    const state = getPreset('annihilation').state
    const electrons = state.excitations.filter((entry) => entry.field === 'electron')

    expect(electrons).toHaveLength(2)
    const charges = electrons.map((entry) => entry.charge)
    expect(charges).toEqual(expect.arrayContaining([electronDefaults.charge, positronDefaults.charge]))
  })

  test('default preset starts on the interactive annihilation setup', () => {
    expect(defaultPresetId).toBe('annihilation')
  })

  test('annihilation preset collides under normal stepping', () => {
    let state = getPreset('annihilation').state

    for (let i = 0; i < 90 && !state.lastAnnihilation; i += 1) {
      state = stepSimulation(state, 1 / 120, { annihilationDistance: 0.075 })
    }

    expect(state.lastAnnihilation).not.toBeNull()
    expect(state.excitations.filter((entry) => entry.field === 'electron' && entry.alive)).toHaveLength(0)
    expect(state.excitations.filter((entry) => entry.field === 'photon' && entry.alive)).toHaveLength(2)
  })

  test('all generated excitations include explicit simulation fields', () => {
    const state = getPreset('annihilation').state

    state.excitations.forEach((entry) => {
      expect(entry).toHaveProperty('id')
      expect(entry).toHaveProperty('field')
      expect(entry).toHaveProperty('kind')
      expect(entry).toHaveProperty('charge')
      expect(entry).toHaveProperty('spinLabel')
      expect(entry).toHaveProperty('mass')
      expect(entry).toHaveProperty('position')
      expect(entry).toHaveProperty('momentum')
      expect(entry).toHaveProperty('amplitude')
      expect(entry).toHaveProperty('phase')
      expect(entry).toHaveProperty('alive')
      expect(entry).toHaveProperty('selected')
      expect(typeof entry.amplitude).toBe('number')
      expect(typeof entry.phase).toBe('number')
      expect(typeof entry.alive).toBe('boolean')
      expect(typeof entry.selected).toBe('boolean')
    })
  })

  test('photon mass is zero in constants', () => {
    expect(PHOTON_MASS_SIM).toBe(0)
  })
})
