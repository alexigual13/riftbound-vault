import { LoginForm } from './login-form'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function LoginPage({ searchParams }: { searchParams: { next?: string; mode?: string } }) {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-primary to-primary/40" />
            <span className="font-display tracking-widest">RIFTBOUND VAULT</span>
          </div>
          <CardTitle>Inicia sesión</CardTitle>
          <CardDescription>
            Sincroniza tu colección en todos tus dispositivos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={searchParams.next} initialMode={searchParams.mode === 'register' ? 'register' : 'login'} />
        </CardContent>
      </Card>
    </div>
  )
}
