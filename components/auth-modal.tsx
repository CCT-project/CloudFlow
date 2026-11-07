'use client'

import React, { useState } from 'react'
import { X, Mail, Lock, User, Eye, EyeOff, AlertCircle, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface UserSession {
  id: string
  email: string
  name: string
}

interface AuthModalProps {
  mode: 'signin' | 'register'
  onClose: () => void
  onSuccess: (user: UserSession) => void
  onSwitchMode: (mode: 'signin' | 'register') => void
}

export function AuthModal({ mode, onClose, onSuccess, onSwitchMode }: AuthModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!email.trim()) {
      errors.email = 'Email address is required.'
    } else if (!emailRegex.test(email.trim())) {
      errors.email = 'Please enter a valid email address.'
    }

    if (!password) {
      errors.password = 'Password is required.'
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters long.'
    }

    if (mode === 'register') {
      if (!name.trim()) {
        errors.name = 'Full name is required.'
      } else if (name.trim().length < 2) {
        errors.name = 'Name must be at least 2 characters.'
      }
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)

    if (!validate()) return

    setLoading(true)
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login'
      const payload = mode === 'register'
        ? { email: email.trim(), password, name: name.trim() }
        : { email: email.trim(), password }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMsg = data.error?.message || data.error?.details?.[0] || 'Authentication failed. Please check your details.'
        setServerError(errorMsg)
        setLoading(false)
        return
      }

      if (data.data?.user) {
        onSuccess(data.data.user)
      } else {
        setServerError('Unexpected server response. Please try again.')
      }
    } catch {
      setServerError('Unable to connect to authentication service. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="grid size-7 place-items-center rounded-lg bg-emerald-500 text-white font-bold text-xs shadow-sm">
              CF
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
              CloudFlow Access
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {mode === 'signin' ? 'Sign in to CloudFlow' : 'Create research account'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {mode === 'signin'
              ? 'Access real-time simulation experiments and cloud scheduling telemetry.'
              : 'Register to run serverless experiments, configure weights, and persist records.'}
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-xs font-medium text-slate-600">
          <button
            type="button"
            onClick={() => {
              setServerError(null)
              setValidationErrors({})
              onSwitchMode('signin')
            }}
            className={`rounded-lg py-2 transition ${
              mode === 'signin'
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setServerError(null)
              setValidationErrors({})
              onSwitchMode('register')
            }}
            className={`rounded-lg py-2 transition ${
              mode === 'register'
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'hover:text-slate-900'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Server Error Alert */}
        {serverError && (
          <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-600" />
            <div className="leading-relaxed">{serverError}</div>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (validationErrors.name) {
                      setValidationErrors((prev) => ({ ...prev, name: undefined as any }))
                    }
                  }}
                  placeholder="Dr. Jane Doe"
                  className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                    validationErrors.name ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-emerald-500'
                  }`}
                  disabled={loading}
                />
              </div>
              {validationErrors.name && (
                <p className="mt-1 text-[11px] text-rose-600">{validationErrors.name}</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (validationErrors.email) {
                    setValidationErrors((prev) => ({ ...prev, email: undefined as any }))
                  }
                }}
                placeholder="researcher@university.edu"
                className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                  validationErrors.email ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-emerald-500'
                }`}
                disabled={loading}
              />
            </div>
            {validationErrors.email && (
              <p className="mt-1 text-[11px] text-rose-600">{validationErrors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (validationErrors.password) {
                    setValidationErrors((prev) => ({ ...prev, password: undefined as any }))
                  }
                }}
                placeholder="••••••••"
                className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                  validationErrors.password ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-emerald-500'
                }`}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {validationErrors.password ? (
              <p className="mt-1 text-[11px] text-rose-600">{validationErrors.password}</p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400">
                {mode === 'register' ? 'Must be at least 8 characters long.' : ''}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                {mode === 'signin' ? 'Authenticating...' : 'Creating Account...'}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
                <ArrowRight size={14} />
              </span>
            )}
          </Button>
        </form>

        {/* Footer Notice */}
        <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
          {mode === 'signin' ? (
            <p>
              Need an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setServerError(null)
                  setValidationErrors({})
                  onSwitchMode('register')
                }}
                className="font-medium text-emerald-600 hover:underline"
              >
                Create one here
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setServerError(null)
                  setValidationErrors({})
                  onSwitchMode('signin')
                }}
                className="font-medium text-emerald-600 hover:underline"
              >
                Sign in instead
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
