import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuContent,
  ListItem,
} from '@/components/ui/navigation-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DevlabMark, ProductLockup } from '@/components/brand/devlab-brand';
import { signIn, useSession } from '@/lib/auth-client';
import { Separator } from '@/components/ui/separator';
import { GitHub, LinkedIn } from './icons/icons';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { productBrand } from '@/lib/brand';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

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
  const { data: session } = useSession();
  const navigate = useNavigate();

  return (
    <>
      {/* Desktop Navigation - Hidden on mobile */}
      <header className="fixed left-[50%] z-50 hidden w-full max-w-4xl translate-x-[-50%] items-center justify-center px-4 pt-6 lg:flex">
        <nav className="border-input/50 flex w-full max-w-4xl items-center justify-between gap-2 rounded-xl border bg-white p-3 px-6 text-zinc-950 shadow-sm transition-colors duration-200 motion-reduce:transition-none dark:border-t dark:bg-[#1E1E1E] dark:text-white">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex cursor-pointer items-center gap-1.5">
              <ProductLockup />
              <span className="text-muted-foreground text-[10px]">beta</span>
            </Link>
            <NavigationMenu>
              <NavigationMenuList className="gap-1">
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="cursor-pointer bg-transparent text-zinc-950 focus-visible:ring-2 focus-visible:ring-[#6f00ff] dark:text-white">
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
                  <NavigationMenuTrigger className="cursor-pointer bg-transparent text-zinc-950 focus-visible:ring-2 focus-visible:ring-[#6f00ff] dark:text-white">
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
                <NavigationMenuItem className="cursor-pointer bg-transparent text-zinc-950 dark:text-white">
                  <a
                    href="https://devlab.io/en/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="ghost" className="ml-1 h-9 bg-transparent">
                      Privacy
                    </Button>
                  </a>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>
          <div className="flex gap-2">
            <a
              href={productBrand.companyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-8 items-center gap-2 rounded-lg border border-[#6f00ff]/20 bg-[#f1e8ff] px-3 text-sm font-medium text-[#140151] transition-colors hover:bg-[#e6d5ff] dark:border-[#9d6dff]/30 dark:bg-[#6f00ff]/15 dark:text-[#c9afff] dark:hover:bg-[#6f00ff]/25"
            >
              <DevlabMark className="size-4" />
              Devlab
            </a>
            <Button
              className="h-8 cursor-pointer bg-[#6f00ff] text-white hover:bg-[#5600ff] hover:text-white"
              onClick={() => {
                if (session) {
                  navigate('/mail/inbox');
                } else {
                  toast.promise(
                    signIn.social({
                      provider: 'google',
                      callbackURL: `${window.location.origin}/mail`,
                    }),
                    {
                      error: 'Login redirect failed',
                    },
                  );
                }
              }}
            >
              Get Started
            </Button>
          </div>
        </nav>
      </header>

      {/* Mobile Navigation Sheet */}
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="fixed left-4 top-6 z-50">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] sm:w-[400px] dark:bg-[#111111]">
            <SheetHeader className="flex flex-row items-center justify-between">
              <SheetTitle>
                <Link to="/" onClick={() => setOpen(false)}>
                  <ProductLockup />
                </Link>
              </SheetTitle>
            </SheetHeader>
            <div className="mt-8 flex flex-col space-y-3">
              <div className="flex flex-col space-y-3">
                <Link to="/" onClick={() => setOpen(false)}>
                  Home
                </Link>
                <a href={productBrand.contactUrl} target="_blank" rel="noopener noreferrer">
                  Contact
                </a>
                {aboutLinks.map((link) => (
                  <a key={link.title} href={link.href} className="block font-medium">
                    {link.title}
                  </a>
                ))}
              </div>
              <a
                target="_blank"
                rel="noreferrer noopener"
                href={productBrand.contactUrl}
                className="font-medium"
              >
                Contact Us
              </a>
            </div>
            <Separator className="mt-8" />
            <div className="mt-8 flex flex-row items-center justify-center gap-4">
              {resources.map((resource) => {
                const Icon = IconComponent[resource.platform];
                return (
                  <Link
                    key={resource.title}
                    to={resource.href}
                    className="flex items-center gap-2 font-medium"
                  >
                    {resource.platform && <Icon className="dark:fill-muted-foreground h-5 w-5" />}
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
