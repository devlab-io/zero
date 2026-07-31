import { productBrand } from '@/lib/brand';

const TITLE = productBrand.fullName;
const DESCRIPTION = productBrand.description;

export const siteConfig = {
  title: TITLE,
  description: DESCRIPTION,
  icons: {
    icon: '/reta-mark.svg',
  },
  applicationName: productBrand.name,
  creator: productBrand.company,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: `${import.meta.env.VITE_PUBLIC_APP_URL}/reta-mark.svg`,
        width: 512,
        height: 512,
        alt: TITLE,
      },
    ],
  },
  category: 'Email Client',
  alternates: {
    canonical: import.meta.env.VITE_PUBLIC_APP_URL,
  },
  keywords: [
    'Mail',
    'Email',
    'Email Client',
    'Gmail Alternative',
    'Webmail',
    'Secure Email',
    'Email Management',
    'Email Platform',
    'Communication Tool',
    'Productivity',
    'Business Email',
    'Personal Email',
    'Mail Server',
    'Email Software',
    'Collaboration',
    'Message Management',
    'Digital Communication',
    'Email Service',
    'Web Application',
    'Devlab',
    'Tahiti',
    'Reta',
  ],
  //   metadataBase: new URL(import.meta.env.VITE_PUBLIC_APP_URL!),
};
