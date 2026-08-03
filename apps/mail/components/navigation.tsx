import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuContent,
  ListItem,
} from '@/components/ui/navigation-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ProductLockup } from '@/components/brand/devlab-brand';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Separator } from '@/components/ui/separator';
import { useEffect, useRef, useState } from 'react';
import { GitHub, LinkedIn } from './icons/icons';
import { Button } from '@/components/ui/button';
import { productBrand } from '@/lib/brand';
import { Link } from 'react-router';
import { Menu } from 'lucide-react';

const mobileNavigationPanelId = 'mobile-navigation-panel';

const resources = [
  {
    title: 'GitHub',
    href: 'https://github.com/devlab-io',
    description: 'Explore the products and open-source work built by Devlab.',
    platform: 'github' as const,
  },
  {
    title: 'LinkedIn',
    href: 'https://www.linkedin.com/company/devlab-pf',
    description: 'Follow Devlab product news from Tahiti.',
    platform: 'linkedin' as const,
  },
];

const aboutLinks = [
  {
    title: 'About',
    href: productBrand.companyUrl,
    description: 'Meet Devlab, the Tahiti team behind Reta.',
  },
  {
    title: 'Privacy',
    href: 'https://devlab.io/en/privacy-policy',
    description: 'Read Devlab’s privacy policy and data handling practices.',
  },
  {
    title: 'Legal',
    href: 'https://devlab.io/en/legal-mentions',
    description: 'Review Devlab’s legal information.',
  },
];

const IconComponent = {
  github: GitHub,
  linkedin: LinkedIn,
};

export function Navigation() {
  const [open, setOpen] = useState(false);
  const mobileNavigationTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationWasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    const closeMobileNavigationOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', closeMobileNavigationOnEscape, true);
    return () => {
      document.removeEventListener('keydown', closeMobileNavigationOnEscape, true);
    };
  }, [open]);

  useEffect(() => {
    if (mobileNavigationWasOpenRef.current && !open) {
      mobileNavigationTriggerRef.current?.focus();
    }
    mobileNavigationWasOpenRef.current = open;
  }, [open]);

  return (
    <>
      {/* Desktop Navigation - Hidden on mobile */}
      <header className="fixed left-[50%] z-50 hidden w-full max-w-4xl translate-x-[-50%] items-center justify-center px-4 pt-6 lg:flex">
        <nav className="border-input/50 flex w-full max-w-4xl items-center justify-between gap-2 rounded-xl border bg-white p-3 px-5 text-zinc-950 shadow-sm transition-colors duration-200 motion-reduce:transition-none dark:border-t dark:bg-[#1E1E1E] dark:text-white">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              aria-label={`${productBrand.fullName} home`}
              className="focus-visible:ring-brand-violet flex cursor-pointer items-center gap-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2"
            >
              <ProductLockup />
              <span className="text-muted-foreground text-[10px]">beta</span>
            </Link>
            <NavigationMenu>
              <NavigationMenuList className="gap-1">
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="focus-visible:ring-brand-violet cursor-pointer bg-transparent text-zinc-950 focus-visible:ring-2 dark:text-white">
                    Company
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[300px] gap-3 p-4 md:w-[300px] md:grid-cols-1 lg:w-[400px]">
                      {aboutLinks.map((link) => (
                        <ListItem key={link.title} title={link.title} href={link.href}>
                          {link.description}
                        </ListItem>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="focus-visible:ring-brand-violet cursor-pointer bg-transparent text-zinc-950 focus-visible:ring-2 dark:text-white">
                    Resources
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                      {resources.map((resource) => (
                        <ListItem
                          key={resource.title}
                          title={resource.title}
                          href={resource.href}
                          platform={resource.platform}
                        >
                          {resource.description}
                        </ListItem>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuItem className="bg-transparent text-zinc-950 dark:text-white">
                  <Button asChild variant="ghost" className="h-9 cursor-pointer bg-transparent">
                    <a href={productBrand.contactUrl} target="_blank" rel="noopener noreferrer">
                      Contact
                    </a>
                  </Button>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="focus-visible:ring-brand-violet size-8 justify-center p-0 focus-visible:outline-none focus-visible:ring-2" />
            <Button
              asChild
              className="bg-brand-violet hover:bg-brand-violet-deep h-8 cursor-pointer text-white hover:text-white"
            >
              <Link to="/login">Get started</Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* Mobile Navigation Sheet */}
      <div className="lg:hidden">
        <ThemeToggle
          showLabel
          className="focus-visible:ring-brand-violet fixed right-4 top-6 z-50 min-h-11 border border-zinc-200 bg-white px-3 shadow-sm hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 dark:border-white/10 dark:bg-[#1E1E1E] dark:hover:bg-[#272727]"
        />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              ref={mobileNavigationTriggerRef}
              variant="outline"
              size="icon"
              aria-label={open ? 'Close navigation' : 'Open navigation'}
              aria-expanded={open}
              aria-controls={mobileNavigationPanelId}
              className="focus-visible:ring-brand-violet fixed left-4 top-6 z-50 size-11 min-h-11 min-w-11 bg-white shadow-sm dark:bg-[#1E1E1E]"
            >
              <Menu aria-hidden="true" className="h-6 w-6" />
              <span className="sr-only">{open ? 'Close navigation' : 'Open navigation'}</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            id={mobileNavigationPanelId}
            side="left"
            onEscapeKeyDown={() => setOpen(false)}
            className="w-[300px] sm:w-[400px] dark:bg-[#111111]"
          >
            <SheetHeader className="flex flex-row items-center justify-between">
              <SheetTitle>
                <Link to="/" onClick={() => setOpen(false)}>
                  <ProductLockup />
                </Link>
              </SheetTitle>
              <SheetDescription className="sr-only">
                Navigate Reta and Devlab resources.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-8 flex flex-col space-y-3">
              <div className="flex flex-col space-y-3">
                <Link to="/" onClick={() => setOpen(false)}>
                  Home
                </Link>
                <a
                  href={productBrand.contactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                >
                  Contact
                </a>
                {aboutLinks.map((link) => (
                  <a
                    key={link.title}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-medium"
                    onClick={() => setOpen(false)}
                  >
                    {link.title}
                  </a>
                ))}
              </div>
            </div>
            <Separator className="mt-8" />
            <div className="mt-8 flex flex-row flex-wrap items-center gap-3">
              {resources.map((resource) => {
                const Icon = IconComponent[resource.platform];
                return (
                  <a
                    key={resource.title}
                    href={resource.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={resource.title}
                    className="focus-visible:ring-brand-violet flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 px-3 font-medium focus-visible:outline-none focus-visible:ring-2 dark:border-white/10"
                    onClick={() => setOpen(false)}
                  >
                    {resource.platform && (
                      <Icon aria-hidden="true" className="dark:fill-muted-foreground h-5 w-5" />
                    )}
                    <span>{resource.title}</span>
                  </a>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
