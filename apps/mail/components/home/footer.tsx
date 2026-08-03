import { DevlabMark, DevlabWordmark, ProductLockup } from '@/components/brand/devlab-brand';
import { GitHub, LinkedIn } from '@/components/icons/icons';
import { productBrand } from '@/lib/brand';
import { Button } from '../ui/button';

/**
 * Footer landing — CTA sur panneau plein (ni texte en dégradé, ni bannière
 * décorative, ni motion), puis colonnes de liens et mentions. Le footer est
 * volontairement sombre sur les deux thèmes : c'est la clôture de page, pas
 * une surface de travail.
 */

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
  return (
    <footer className="bg-panelDark mx-1 mb-3 flex w-full flex-col items-center justify-center overflow-hidden rounded-xl md:mx-4">
      <div className="flex w-full flex-col items-center px-4 pb-6 pt-16 text-center md:pt-24">
        <h2 className="max-w-3xl text-3xl font-bold text-white sm:text-4xl md:text-5xl">
          Connect your inbox to {productBrand.name}
        </h2>
        <p className="mt-4 max-w-2xl text-base font-normal leading-7 text-white/80 md:text-lg">
          Keep your address and connect through Google. Reta works with the mailbox you already use;
          your team sees only the threads you explicitly share.
        </p>
        <Button
          asChild
          className="mt-6 h-9 cursor-pointer bg-white px-5 text-[#140151] hover:bg-[#f1e8ff]"
        >
          <a href="/login">Get started</a>
        </Button>
      </div>

      <div className="relative mx-auto mb-12 mt-10 flex w-full max-w-[1100px] flex-col items-start justify-start gap-10 self-center px-4 md:mt-20">
        <div className="flex w-full flex-col items-start justify-between md:flex-row">
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
                  className="flex size-11 items-center justify-center gap-2.5 rounded-full bg-white/10 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <social.icon className="size-3.5 fill-white" />
                </a>
              ))}
            </div>
            <a
              href={productBrand.companyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-start gap-3 text-white/90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-[#6f00ff] text-white">
                <DevlabMark className="size-4" />
              </span>
              <span className="text-sm">Built in Tahiti by</span>
              <DevlabWordmark className="h-4 w-auto" />
            </a>
          </div>

          <div className="grid w-full flex-1 grid-cols-2 items-start gap-8 sm:grid-cols-3 md:w-auto md:justify-end md:gap-10">
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
          <div className="text-xs font-medium leading-tight text-white/90 sm:text-sm">
            © 2026 Devlab. {productBrand.name} is built in Tahiti.
          </div>
          <div className="flex items-center gap-4">
            <a
              href={productBrand.companyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-nowrap text-sm font-normal leading-tight text-white/90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              About Devlab
            </a>
          </div>
        </div>
      </div>
    </footer>
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
      <div className="self-stretch text-sm font-normal text-white/75">{title}</div>
      <div className="flex flex-col items-start justify-start gap-4 self-stretch">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target={link.external ? '_blank' : undefined}
            rel={link.external ? 'noopener noreferrer' : undefined}
            className="w-full text-sm font-normal leading-none text-white/90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:text-base"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
