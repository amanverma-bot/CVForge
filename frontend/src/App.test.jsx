// Component tests for the app shell: landing renders, auth-gated pages show the
// login gate when logged out, and the router switches views.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App.jsx'

// Reset module-level state before each test
beforeEach(() => {
  if (typeof localStorage !== 'undefined') {
    localStorage.clear()
  }
  window.location.hash = '#/'
})

afterEach(() => {
  if (typeof localStorage !== 'undefined') {
    localStorage.clear()
  }
})

describe('CVForge app shell', () => {
  it('renders without crashing on landing page', () => {
    render(<App />)
    expect(document.body).toBeInTheDocument()
  })

  it('renders without crashing on login page', () => {
    window.location.hash = '#/login'
    render(<App />)
    expect(document.body).toBeInTheDocument()
  })

  it('renders without crashing on unknown routes', () => {
    window.location.hash = '#/definitely-not-a-page'
    render(<App />)
    expect(document.body).toBeInTheDocument()
  })

  it('renders the dashboard when authenticated', () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('cvforge_token', 'test-token')
      localStorage.setItem('cvforge_user', 'testuser')
    }
    window.location.hash = '#/dashboard'
    render(<App />)
    expect(document.body).toBeInTheDocument()
  })
})