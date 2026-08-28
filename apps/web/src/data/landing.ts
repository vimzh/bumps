export const landingContent = {
  hero: {
    brand: "bumps",
    subheading: "maps you can feel",
    tagline:
      "Upload a floor plan, get a 3D-printable tactile map for blind navigation.",
    upload: {
      failed: "Upload failed. Try again.",
      hint: "PDF, PNG, or JPG · up to 10 MB",
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
