import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await isAdmin()) redirect('/admin');
  return (
    <div className="wrap">
      <div className="card center" style={{ textAlign: 'center' }}>
        <img
          src="/icon-192.png"
          alt="BAPS Gorwa Yuvak Mandal logo"
          width={60}
          height={60}
          style={{ borderRadius: '50%', display: 'inline-block', marginBottom: 14, boxShadow: '0 3px 10px rgba(0,0,0,0.1)' }}
        />
        <h1>Admin sign in</h1>
        <p className="muted">Enter the admin password to see attendance.</p>
        <LoginForm />
      </div>
    </div>
  );
}

