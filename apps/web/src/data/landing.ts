export const landingContent = {
  hero: {
    brand: "bumps",
    subheading: "Floor plan in. Tactile map out.",
    tagline:
      "Accessibility you can print: turn any floor plan into a map blind visitors read by touch. Minutes to design, a few dollars to print — so every building can afford to be accessible.",
    upload: {
      failed: "Upload failed. Try again.",
      guideHref: "/input-guide",
      guideLabel: "Good and bad floor-plan examples",
      hint: "PDF, PNG, JPG, or WebP · up to 10 MB",
      label: "Upload floor plan",
      tooLarge: "That file is over 10 MB. Try a smaller export.",
      uploading: "Uploading…",
    },
    compliance: {
      lead: "Every map is validated rule-by-rule against",
      standards: [
        {
          name: "BANA 2022",
          fullName:
            "Guidelines and Standards for Tactile Graphics (2022), Braille Authority of North America",
          href: "https://www.brailleauthority.org/tg/",
        },
        {
          name: "ADA §703",
          fullName:
            "ADA Standards for Accessible Design §703 — braille and tactile signage",
          href: "https://www.access-board.gov/ada/guides/chapter-7-signs/",
        },
      ],
      tail: "— it exports only at zero violations.",
    },
  },
  footer: {
    poweredBy: "powered by Gemini",
  },
} as const;
