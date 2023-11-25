import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from './components/Providers';
import NavBar from './components/NavBar';
import Footer from './components/Footer';
import { getUnreadMessagesCount } from './lib/actions';
const inter = Inter({ subsets: ['latin'] });
import { Suspense } from 'react';
import { Box, Flex, HStack } from '@chakra-ui/react';
import Loading from './loading';

export const metadata: Metadata = {
  title: 'Social Media App',
  description: 'Generated by create next app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <NavBar />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
