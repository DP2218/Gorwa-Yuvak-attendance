import Link from 'next/link';

export default function Header() {
  return (
    <header className="topbar">
      <div className="wrap">
        <Link href="/">Yuvak Attendance</Link>
        <nav>
          <Link href="/">Mark attendance</Link>
          <Link href="/admin">Admin</Link>
        </nav>
      </div>
    </header>
  );
}
