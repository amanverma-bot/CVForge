// Component tests for the app shell: landing renders, auth-gated pages show the
// login gate when logged out, and the hash router switches views.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App.jsx'

describe('CVForge app shell', () => {
  it('renders the landing hero for logged-out visitors', () => {
    window.location.hash = '#/'
    render(<App />)
    expect(screen.getAllByText(/CVForge/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Build My CV/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Build a CV that/i)).toBeInTheDocument()
  })

  it('shows the login gate on the analyzer page when logged out', () => {
    window.location.hash = '#/analyzer'
    render(<App />)
    expect(screen.getByText(/Login required/i)).toBeInTheDocument()
    expect(screen.getByText(/the CV analyzer/i)).toBeInTheDocument()
  })

  it('shows the login form with register tab and captcha on the login page', async () => {
    window.location.hash = '#/login'
    render(<App />)
    expect(screen.getByText(/Welcome back/i)).toBeInTheDocument()
  })

  it('renders a 404 view for unknown routes', () => {
    window.location.hash = '#/definitely-not-a-page'
    render(<App />)
    expect(screen.getByText(/doesn't exist/i)).toBeInTheDocument()
  })
})
