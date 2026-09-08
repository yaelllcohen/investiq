'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallbackTitle?: string
  onRetry?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
}

// Class component is required here — there is no hook-based equivalent for
// catching render/lifecycle errors in child components (React error boundaries).
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('[ErrorBoundary] caught:', error, info)
  }

  handleRetry = () => {
    this.props.onRetry?.()
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="rounded-xl border border-white/5 flex flex-col items-center justify-center gap-3 text-center px-6"
          style={{ background: '#111827', minHeight: 300 }}
        >
          <AlertTriangle className="h-6 w-6" style={{ color: '#ef4444' }} />
          <p className="text-sm font-medium" style={{ color: '#e2e8f0' }}>
            {this.props.fallbackTitle ?? 'משהו השתבש בטעינת הרכיב'}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{ background: '#3b82f6', color: '#fff' }}
          >
            נסה שוב
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
