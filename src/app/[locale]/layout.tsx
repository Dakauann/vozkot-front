import "../globals.css";

/**
 * Namespaces each supplied by the one route that renders them.
 *
 * The two legal documents are together more than half the catalogue, and every
 * page that is not /privacy-policy or /terms-of-service would otherwise carry
 * about 22 KB of text it never shows.
 */
const ROUTE_LOCAL_NAMESPACES = new Set(["privacyPolicy", "termsOfService"]);

import { Inter, Oxanium } from "next/font/google";
import { getMessages, setRequestLocale } from "next-intl/server";

import { AuthProvider } from "@/contexts/auth-context";
import { AuthDialogHost } from "@/components/auth/auth-dialog-host";
import type { Locale } from "@/i18n/config";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

/**
 * Two faces, two jobs.
 *
 * Inter carries everything read at length: rows, labels, forms, data. Oxanium
 * is the display voice for page titles and figures. Both load `latin-ext`,
 * which is not optional here; pt, de and es all need the accented glyphs, and
 * without the subset an accented word drops to a fallback mid-title.
 */
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"], display: "swap" });
const oxanium = Oxanium({ variable: "--font-oxanium", subsets: ["latin", "latin-ext"], display: "swap" });

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/** Every locale is prerendered, so no visitor pays for a cold locale. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const messages = await getMessages({ locale });
  const metadata = messages.metadata as { title?: string; description?: string } | undefined;

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: {
      default: process.env.NEXT_PUBLIC_APP_NAME ?? metadata?.title ?? "Vozko Tickets",
      template: `%s · ${process.env.NEXT_PUBLIC_APP_NAME ?? "Vozko Tickets"}`,
    },
    description: metadata?.description,
    applicationName: process.env.NEXT_PUBLIC_APP_NAME ?? "Vozko Tickets",
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icon.svg" },
    openGraph: {
      title: process.env.NEXT_PUBLIC_APP_NAME ?? "Vozko Tickets",
      description: metadata?.description,
      images: [{ url: "/brand/vozko-tickets-social.png", width: 1200, height: 630 }],
    },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  // Required for the static rendering of every page below this layout.
  setRequestLocale(locale as Locale);
  // Everything except the two legal documents, which together are more than
  // half the catalogue. NextIntlClientProvider serialises whatever it is given
  // into the HTML of every page, so shipping the privacy policy and the terms
  // to the checkout, and to every other route, costs about 22 KB per request
  // to translate text those two routes alone render. Each of them provides its
  // own namespace locally instead.
  const all = await getMessages();
  const messages = Object.fromEntries(
    Object.entries(all).filter(([namespace]) => !ROUTE_LOCAL_NAMESPACES.has(namespace)),
  );

  return (
    <html lang={locale} suppressHydrationWarning>
      {/* overflow-x-hidden because the landing page's hero peeks its
          neighbouring slides past the gutter on purpose. That bleed was
          also making the whole DOCUMENT scroll 382px sideways on a
          trackpad, which is the scroll nobody wants and the one every
          phone finds first. Clipping the section it comes from does not
          stop it; the page is the scroller, so the page is where it
          stops. Vertical scrolling is untouched. */}
      <body
        className={`${inter.variable} ${oxanium.variable} overflow-x-hidden bg-background font-sans text-foreground antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            <AuthProvider>
              <AuthDialogHost>{children}</AuthDialogHost>
            </AuthProvider>
            <Toaster position="bottom-right" />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
