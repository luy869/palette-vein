import { createContext, useCallback, useContext, useRef, useState } from 'react'

type ToastKind = 'error' | 'success' | 'info'

interface ToastAction {
  label: string
  onClick: () => void
}

interface Toast {
  id: number
  message: string
  kind: ToastKind
  action?: ToastAction
}

interface ToastContextValue {
  push: (message: string, kind?: ToastKind, action?: ToastAction) => void
}

const ToastContext = createContext<ToastContextValue>({ push: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback((message: string, kind: ToastKind = 'info', action?: ToastAction) => {
    const id = ++counter.current
    setToasts(prev => [...prev, { id, message, kind, action }])
    const delay = action ? 5000 : 3000
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      timers.current.delete(id)
    }, delay)
    timers.current.set(id, timer)
  }, [])

  const kindClass: Record<ToastKind, string> = {
    error:   'bg-red-500/90 text-white',
    success: 'bg-green-600/90 text-white',
    info:    'bg-slate-700/90 text-slate-100',
  }

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-xl text-sm shadow-lg backdrop-blur flex items-center pointer-events-auto ${kindClass[t.kind]}`}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                className="ml-3 underline font-medium hover:opacity-80"
                onClick={() => {
                  t.action!.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
