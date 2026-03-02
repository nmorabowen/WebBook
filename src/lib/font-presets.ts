export const fontPresetValues = [
  "source-serif",
  "lato",
  "archivo-narrow",
  "oswald",
  "roboto-condensed",
  "barlow-condensed",
] as const;

export type FontPreset = (typeof fontPresetValues)[number];

export const fontPresetOptions: Array<{
  value: FontPreset;
  label: string;
}> = [
  { value: "source-serif", label: "Source Serif 4" },
  { value: "lato", label: "Lato" },
  { value: "archivo-narrow", label: "Archivo Narrow" },
  { value: "oswald", label: "Oswald" },
  { value: "roboto-condensed", label: "Roboto Condensed" },
  { value: "barlow-condensed", label: "Barlow Condensed" },
];
