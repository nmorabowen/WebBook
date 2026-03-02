export const mathJaxFontValues = [
  "mathjax-newcm",
  "mathjax-tex",
  "mathjax-stix2",
  "mathjax-modern",
  "mathjax-asana",
  "mathjax-bonum",
  "mathjax-dejavu",
  "mathjax-fira",
  "mathjax-pagella",
  "mathjax-schola",
  "mathjax-termes",
] as const;

export const mathJaxFontOptions = [
  { value: "mathjax-newcm", label: "New Computer Modern" },
  { value: "mathjax-tex", label: "MathJax TeX" },
  { value: "mathjax-stix2", label: "STIX2" },
  { value: "mathjax-modern", label: "Latin Modern" },
  { value: "mathjax-asana", label: "Asana Math" },
  { value: "mathjax-bonum", label: "Gyre Bonum" },
  { value: "mathjax-dejavu", label: "Gyre DejaVu" },
  { value: "mathjax-fira", label: "Fira Math" },
  { value: "mathjax-pagella", label: "Gyre Pagella" },
  { value: "mathjax-schola", label: "Gyre Schola" },
  { value: "mathjax-termes", label: "Gyre Termes" },
] as const;

export type MathJaxFontFamily = (typeof mathJaxFontValues)[number];
