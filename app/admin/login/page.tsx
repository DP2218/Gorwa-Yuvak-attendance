import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await isAdmin()) redirect('/admin');
  return (
    <div className="wrap">
      <div className="card center">
        <h1>Admin sign in</h1>
        <p className="muted">Enter the admin password to see attendance.</p>
        <LoginForm />
      </div>
    </div>
  );
}
