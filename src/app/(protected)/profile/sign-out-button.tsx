'use client'

import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export default function SignOutButton() {
  return (
    <Button
      variant="destructive"
      size="sm"
      className="gap-1.5"
      onClick={() => signOut({ callbackUrl: '/' })}
    >
      <LogOut className="h-4 w-4" />
      התנתק
    </Button>
  )
}
