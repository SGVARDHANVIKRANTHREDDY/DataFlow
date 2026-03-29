import { describe, it, expect, beforeEach } from 'vitest'
import { usePipelineStore } from '../../src/stores/pipeline.store'

describe('Pipeline Store - Undo/Redo', () => {
  beforeEach(() => {
    usePipelineStore.getState().reset()
  })

  it('should initialize with empty state', () => {
    const state = usePipelineStore.getState()
    expect(state.steps).toEqual([])
    expect(state.past).toEqual([])
    expect(state.future).toEqual([])
  })

  it('should push to past stack when adding steps', () => {
    const store = usePipelineStore.getState()
    store.addSteps([{ action: 'drop_nulls', params: {} }])
    
    const state = usePipelineStore.getState()
    expect(state.steps.length).toBe(1)
    expect(state.past.length).toBe(1)
    expect(state.past[0].steps).toEqual([])
  })

  it('should undo an action', () => {
    const store = usePipelineStore.getState()
    store.addSteps([{ action: 'drop_nulls', params: {} }])
    expect(usePipelineStore.getState().steps.length).toBe(1)
    
    store.undo()
    const state = usePipelineStore.getState()
    expect(state.steps).toEqual([])
    expect(state.past).toEqual([])
    expect(state.future.length).toBe(1)
    expect(state.future[0].steps[0].action).toBe('drop_nulls')
  })

  it('should redo an action', () => {
    const store = usePipelineStore.getState()
    store.addSteps([{ action: 'drop_nulls', params: {} }])
    store.undo()
    expect(usePipelineStore.getState().steps).toEqual([])
    
    store.redo()
    const state = usePipelineStore.getState()
    expect(state.steps.length).toBe(1)
    expect(state.steps[0].action).toBe('drop_nulls')
    expect(state.past.length).toBe(1)
    expect(state.future).toEqual([])
  })

  it('should respect history limit', () => {
    const store = usePipelineStore.getState()
    // Add 60 steps (limit is 50)
    for (let i = 0; i < 60; i++) {
        store.setName(`Version ${i}`)
    }
    
    const state = usePipelineStore.getState()
    expect(state.past.length).toBe(50)
  })
})
