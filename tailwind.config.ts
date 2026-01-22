import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: "media",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",

        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",

        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",

        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",

        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      typography: {
        DEFAULT: {
          css: {
            color: "hsl(var(--foreground))",
            maxWidth: "100%",
            p: {
              marginTop: "0.75em",
              marginBottom: "0.75em",
            },
            h3: {
              color: "hsl(var(--foreground))",
              marginTop: "1.4em",
              marginBottom: "0.4em",
            },
            strong: {
              color: "hsl(var(--foreground))",
            },
            li: {
              marginTop: "0.4em",
              marginBottom: "0.4em",
            },
            code: {
              color: "hsl(var(--primary))",
            },
            blockquote: {
              borderLeftColor: "hsl(var(--border))",
              color: "hsl(var(--muted-foreground))",
            },
          },
        },
        invert: {
          css: {
            color: "hsl(var(--foreground))",
          },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;