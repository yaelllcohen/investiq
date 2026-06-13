import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-xl px-3 py-1 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      style={{
        background: 'var(--iq-elevated)',
        border: '1px solid var(--iq-border)',
        color: 'var(--iq-text)',
        outline: 'none',
      }}
      ref={ref}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export { Input }
