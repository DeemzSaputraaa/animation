import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Ruang Cerita — Avatar Presenter', description: 'Ubah naskah menjadi performa presenter 3D dengan suara, ekspresi, dan gerakan yang selaras.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="id"><body>{children}</body></html>; }
