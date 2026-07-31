import { DevlabMark, DevlabWordmark, ProductLockup } from '@/components/brand/devlab-brand';
import { GitHub, LinkedIn } from '@/components/icons/icons';
import { productBrand } from '@/lib/brand';
import { motion } from 'motion/react';
import { Button } from '../ui/button';
import { useRef } from 'react';

const socialLinks = [
  {
    name: 'LinkedIn',
    href: 'https://www.linkedin.com/company/devlab-pf',
    icon: LinkedIn,
  },
  {
    name: 'GitHub',
    href: 'https://github.com/devlab-io',
    icon: GitHub,
  },
];

export default function Footer() {
  const ref = useRef(null);

  return (
    <div className="bg-panelDark mx-1 mb-3 flex flex-col items-center justify-center overflow-hidden rounded-xl md:mx-4 md:mb-3">
      <div className="w-full">
        <div
          className="h-28 w-full rounded-t-2xl md:h-52 lg:h-72"
          style={{
            background: 'linear-gradient(135deg, #ffa70b 0%, #eb1778 48%, #6f00ff 100%)',
          }}
          aria-hidden="true"
        />
        <div className="relative bottom-20 inline-flex w-full justify-center lg:bottom-60">
          <div
            ref={ref}
            className="relative inline-flex w-full flex-col items-center justify-center gap-20 rounded-full"
          >
            <div className="flex flex-col items-center justify-center px-2">
              <div className="flex flex-col items-center py-5">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="lg:to-panelDark lg:bg-linear-to-b inline-block text-center text-2xl font-bold text-white sm:text-4xl md:text-5xl lg:from-white lg:via-white/70 lg:bg-clip-text lg:text-8xl lg:text-transparent"
                >
                  <span>Email without the wait.</span>
                  <br />
                  Built by Devlab.
                </motion.div>
              </div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="hidden flex-col items-center justify-start md:flex"
              >
                <div className="max-w-3xl text-center text-lg font-normal leading-7 text-white lg:text-2xl">
                  {productBrand.name} keeps every reply, shortcut and next message immediately at
                  hand.
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="flex w-fit flex-col items-center justify-center md:pt-4"
              >
                <a href="/login">
                  <Button className="h-8 cursor-pointer bg-white text-[#140151] hover:bg-[#f1e8ff]">
                    Get Started
                  </Button>
                </a>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-50 mx-auto mb-12 mt-10 flex max-w-[2900px] flex-col items-start justify-start gap-10 self-stretch px-4 md:mt-52">
        <div className="flex w-full flex-col items-start justify-between md:flex-row lg:w-[900px]">
          <div className="mb-10 inline-flex flex-col items-start justify-between gap-4 self-stretch md:mb-0">
            <a href="/" aria-label={`${productBrand.fullName} home`}>
              <ProductLockup inverted />
            </a>
            <div className="inline-flex items-center justify-start gap-4">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.name}
                  className="flex items-center justify-center gap-2.5 rounded-full bg-white/10 p-2 backdrop-blur-[20px] transition-colors hover:bg-white/20"
                >
                  <social.icon className="size-3.5 fill-white" />
                </a>
              ))}
            </div>
            <a
              href={productBrand.companyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-start gap-3 text-white/80 transition-opacity hover:opacity-100"
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-[#6f00ff] text-white">
                <DevlabMark className="size-4" />
              </span>
              <span className="text-sm">Built in Tahiti by</span>
              <DevlabWordmark className="h-4 w-auto" />
            </a>
          </div>

          <div className="flex flex-1 items-start justify-end gap-5 md:gap-10">
            <FooterColumn
              title="Product"
              links={[
                { label: 'Fast inbox', href: '/' },
                { label: 'Keyboard shortcuts', href: '/settings/shortcuts' },
                { label: 'Get started', href: '/login' },
              ]}
            />
            <FooterColumn
              title="Company"
              links={[
                { label: 'Devlab', href: productBrand.companyUrl, external: true },
                { label: 'Contact', href: productBrand.contactUrl, external: true },
                {
                  label: 'LinkedIn',
                  href: 'https://www.linkedin.com/company/devlab-pf',
                  external: true,
                },
              ]}
            />
            <FooterColumn
              title="Legal"
              links={[
                {
                  label: 'Privacy',
                  href: 'https://devlab.io/en/privacy-policy',
                  external: true,
                },
                {
                  label: 'Legal notice',
                  href: 'https://devlab.io/en/legal-mentions',
                  external: true,
                },
              ]}
            />
          </div>
        </div>

        <div className="h-px self-stretch bg-white/20" />
        <div className="inline-flex flex-col-reverse items-center justify-between gap-3 self-stretch md:flex-row">
          <div className="text-xs font-medium leading-tight text-white/80 sm:text-sm">
            © 2026 Devlab. {productBrand.name} is built in Tahiti.
          </div>
          <div className="flex items-center gap-4">
            <a
              href={productBrand.companyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-nowrap text-sm font-normal leading-tight text-white/70 transition-opacity hover:opacity-100"
            >
              About Devlab
            </a>
            <div className="h-5 w-px bg-white/20" />
            <a
              href="https://devlab.io/en/legal-mentions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-nowrap text-sm font-normal leading-tight text-white/70 transition-opacity hover:opacity-100"
            >
              Legal notice
            </a>
            <div className="h-5 w-px bg-white/20" />
            <a
              href="https://devlab.io/en/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-nowrap text-sm font-normal leading-tight text-white/70 transition-opacity hover:opacity-100"
            >
              Privacy
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
}) {
  return (
    <div className="inline-flex flex-col items-start justify-start gap-5">
      <div className="self-stretch text-sm font-normal text-white/40">{title}</div>
      <div className="flex flex-col items-start justify-start gap-4 self-stretch">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target={link.external ? '_blank' : undefined}
            rel={link.external ? 'noopener noreferrer' : undefined}
            className="w-full text-sm font-normal leading-none text-white/80 transition-opacity hover:opacity-100 md:text-base"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
