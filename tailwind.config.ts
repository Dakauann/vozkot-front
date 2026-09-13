import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-oxanium)", "var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "0.9375rem" }],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
          active: "hsl(var(--primary-active))",
          50: "hsl(var(--primary-50))",
          100: "hsl(var(--primary-100))",
          200: "hsl(var(--primary-200))",
          300: "hsl(var(--primary-300))",
          400: "hsl(var(--primary-400))",
          500: "hsl(var(--primary-500))",
          600: "hsl(var(--primary-600))",
          700: "hsl(var(--primary-700))",
          800: "hsl(var(--primary-800))",
          900: "hsl(var(--primary-900))"
        },
        "primary-ink": "hsl(var(--primary-ink))",
        "primary-edge": "hsl(var(--primary-edge))",
        "primary-subtle": { DEFAULT: "hsl(var(--primary-subtle))", hover: "hsl(var(--primary-subtle-hover))" },
        ornament: "hsl(var(--ornament) / <alpha-value>)",
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))", hover: "hsl(var(--accent-hover))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))", ink: "hsl(var(--destructive-ink))" },
        healthy: { DEFAULT: "hsl(var(--healthy))", foreground: "hsl(var(--healthy-foreground))", ink: "hsl(var(--healthy-ink))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))", ink: "hsl(var(--warning-ink))" },
        info: { DEFAULT: "hsl(var(--info))", foreground: "hsl(var(--info-foreground))", ink: "hsl(var(--info-ink))" },
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        "control-edge": "hsl(var(--control-edge))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))"
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))"
        }
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "var(--radius)",
        md: "var(--radius)",
        lg: "8px",
        xl: "10px",
        "2xl": "12px",
        "3xl": "16px"
      },
      boxShadow: {
        sm: "var(--elev-1)",
        DEFAULT: "var(--elev-2)",
        md: "var(--elev-3)",
        lg: "var(--elev-4)",
        xl: "var(--elev-5)",
        "2xl": "var(--elev-6)",
        button: "var(--elev-button)",
        "button-hover": "var(--elev-button-hover)",
        "button-primary": "var(--elev-button-primary)",
        "button-primary-hover": "var(--elev-button-primary-hover)",
        quiet: "var(--elev-button-quiet)",
        "quiet-hover": "var(--elev-button-quiet-hover)"
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "dot-pulse": {
          "0%, 80%, 100%": { opacity: "0.25", transform: "scale(0.8)" },
          "40%": { opacity: "1", transform: "scale(1)" }
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s cubic-bezier(0.1,0.9,0.2,1)",
        "accordion-up": "accordion-up 0.2s cubic-bezier(0.1,0.9,0.2,1)",
        "dot-pulse": "dot-pulse 1.2s cubic-bezier(0.33,0,0.67,1) infinite"
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.33,0,0.67,1)",
        panel: "cubic-bezier(0.1,0.9,0.2,1)",
        exit: "cubic-bezier(0.9,0.1,1,0.2)"
      },
      transitionDuration: { DEFAULT: "150ms" }
    }
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
