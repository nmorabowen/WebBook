export type MathAutocompleteItem = {
  id: string;
  trigger: string;
  label: string;
  detail: string;
  insertValue: string;
  caretOffset: number;
  previewLatex: string;
};

function command(trigger: string, detail: string, previewLatex?: string): MathAutocompleteItem {
  const insertValue = `\\${trigger}`;
  return {
    id: trigger,
    trigger,
    label: insertValue,
    detail,
    insertValue,
    caretOffset: insertValue.length,
    previewLatex: previewLatex ?? insertValue,
  };
}

function template(
  trigger: string,
  insertValue: string,
  caretOffset: number,
  detail: string,
  label = insertValue,
  previewLatex?: string,
): MathAutocompleteItem {
  return {
    id: trigger,
    trigger,
    label,
    detail,
    insertValue,
    caretOffset,
    previewLatex:
      previewLatex ??
      insertValue.replace(/\[\]/g, "[n]").replace(/\{\}/g, "{x}"),
  };
}

function environment(name: string, detail: string): MathAutocompleteItem {
  const insertValue = `\\begin{${name}}\n  \n\\end{${name}}`;
  const previewByName: Record<string, string> = {
    matrix: "\\begin{matrix}1 & 0\\\\0 & 1\\end{matrix}",
    pmatrix: "\\begin{pmatrix}1 & 0\\\\0 & 1\\end{pmatrix}",
    bmatrix: "\\begin{bmatrix}1 & 0\\\\0 & 1\\end{bmatrix}",
    Bmatrix: "\\begin{Bmatrix}1 & 0\\\\0 & 1\\end{Bmatrix}",
    vmatrix: "\\begin{vmatrix}a & b\\\\c & d\\end{vmatrix}",
    Vmatrix: "\\begin{Vmatrix}a & b\\\\c & d\\end{Vmatrix}",
    cases: "f(x)=\\begin{cases}x & x>0\\\\0 & x\\le 0\\end{cases}",
    aligned: "\\begin{aligned}a&=b+c\\\\x&=y+z\\end{aligned}",
    align: "\\begin{align}a&=b+c\\\\x&=y+z\\end{align}",
    gathered: "\\begin{gathered}a=b+c\\\\x=y+z\\end{gathered}",
    split: "\\begin{split}a&=b+c\\\\&=d+e\\end{split}",
    array: "\\begin{array}{cc}1 & 0\\\\0 & 1\\end{array}",
  };
  return template(
    name,
    insertValue,
    `\\begin{${name}}\n  `.length,
    detail,
    `\\begin{${name}}`,
    previewByName[name] ?? insertValue,
  );
}

const greekCommands = [
  ["alpha", "Greek letter alpha"],
  ["beta", "Greek letter beta"],
  ["gamma", "Greek letter gamma"],
  ["delta", "Greek letter delta"],
  ["epsilon", "Greek letter epsilon"],
  ["varepsilon", "Variant epsilon"],
  ["zeta", "Greek letter zeta"],
  ["eta", "Greek letter eta"],
  ["theta", "Greek letter theta"],
  ["vartheta", "Variant theta"],
  ["iota", "Greek letter iota"],
  ["kappa", "Greek letter kappa"],
  ["lambda", "Greek letter lambda"],
  ["mu", "Greek letter mu"],
  ["nu", "Greek letter nu"],
  ["xi", "Greek letter xi"],
  ["pi", "Greek letter pi"],
  ["varpi", "Variant pi"],
  ["rho", "Greek letter rho"],
  ["varrho", "Variant rho"],
  ["sigma", "Greek letter sigma"],
  ["varsigma", "Final sigma"],
  ["tau", "Greek letter tau"],
  ["upsilon", "Greek letter upsilon"],
  ["phi", "Greek letter phi"],
  ["varphi", "Variant phi"],
  ["chi", "Greek letter chi"],
  ["psi", "Greek letter psi"],
  ["omega", "Greek letter omega"],
  ["Gamma", "Uppercase gamma"],
  ["Delta", "Uppercase delta"],
  ["Theta", "Uppercase theta"],
  ["Lambda", "Uppercase lambda"],
  ["Xi", "Uppercase xi"],
  ["Pi", "Uppercase pi"],
  ["Sigma", "Uppercase sigma"],
  ["Upsilon", "Uppercase upsilon"],
  ["Phi", "Uppercase phi"],
  ["Psi", "Uppercase psi"],
  ["Omega", "Uppercase omega"],
] as const;

const operatorCommands = [
  ["frac", "\\frac{}{}", 6, "Fraction template"],
  ["dfrac", "\\dfrac{}{}", 7, "Display fraction template"],
  ["tfrac", "\\tfrac{}{}", 7, "Text fraction template"],
  ["sqrt", "\\sqrt{}", 6, "Square-root template"],
  ["root", "\\sqrt[]{}", 6, "Nth-root template"],
  ["sum", "Summation operator"],
  ["prod", "Product operator"],
  ["coprod", "Coproduct operator"],
  ["int", "Integral operator"],
  ["iint", "Double integral"],
  ["iiint", "Triple integral"],
  ["oint", "Contour integral"],
  ["partial", "Partial derivative symbol"],
  ["nabla", "Gradient or del operator"],
  ["lim", "Limit operator"],
  ["limsup", "Limit superior"],
  ["liminf", "Limit inferior"],
  ["sup", "Supremum operator"],
  ["inf", "Infimum operator"],
  ["max", "Maximum operator"],
  ["min", "Minimum operator"],
  ["argmax", "Argument of maximum"],
  ["argmin", "Argument of minimum"],
  ["det", "Determinant operator"],
  ["dim", "Dimension operator"],
  ["gcd", "Greatest common divisor"],
  ["hom", "Hom operator"],
  ["ker", "Kernel operator"],
  ["Pr", "Probability operator"],
] as const;

const relationCommands = [
  ["leq", "Less-than or equal"],
  ["geq", "Greater-than or equal"],
  ["neq", "Not equal"],
  ["approx", "Approximately equal"],
  ["sim", "Similarity relation"],
  ["simeq", "Asymptotically equal"],
  ["cong", "Congruent relation"],
  ["equiv", "Equivalent relation"],
  ["propto", "Proportional to"],
  ["ll", "Much less than"],
  ["gg", "Much greater than"],
  ["subset", "Subset relation"],
  ["subseteq", "Subset-or-equal relation"],
  ["supset", "Superset relation"],
  ["supseteq", "Superset-or-equal relation"],
  ["in", "Set membership"],
  ["notin", "Not in set"],
  ["ni", "Contains as member"],
  ["parallel", "Parallel relation"],
  ["perp", "Perpendicular relation"],
  ["models", "Models relation"],
] as const;

const binaryCommands = [
  ["cdot", "Centered dot multiplication"],
  ["times", "Multiplication cross"],
  ["div", "Division symbol"],
  ["pm", "Plus-minus symbol"],
  ["mp", "Minus-plus symbol"],
  ["ast", "Asterisk operator"],
  ["star", "Star operator"],
  ["circ", "Composition operator"],
  ["bullet", "Bullet operator"],
  ["oplus", "Direct-sum operator"],
  ["otimes", "Tensor product operator"],
  ["cup", "Set union"],
  ["cap", "Set intersection"],
  ["setminus", "Set subtraction"],
  ["vee", "Logical OR or join"],
  ["wedge", "Logical AND or meet"],
  ["land", "Logical AND"],
  ["lor", "Logical OR"],
  ["otimes", "Tensor product"],
  ["oslash", "Slashed circle operator"],
  ["odot", "Dotted circle operator"],
] as const;

const arrowCommands = [
  ["to", "Right arrow"],
  ["mapsto", "Maps to arrow"],
  ["leftarrow", "Left arrow"],
  ["rightarrow", "Right arrow"],
  ["leftrightarrow", "Left-right arrow"],
  ["uparrow", "Up arrow"],
  ["downarrow", "Down arrow"],
  ["Rightarrow", "Double right arrow"],
  ["Leftarrow", "Double left arrow"],
  ["Leftrightarrow", "Double left-right arrow"],
  ["iff", "If and only if"],
  ["implies", "Implies arrow"],
  ["longrightarrow", "Long right arrow"],
  ["longleftarrow", "Long left arrow"],
  ["longleftrightarrow", "Long left-right arrow"],
] as const;

const setCommands = [
  ["emptyset", "Empty set symbol"],
  ["varnothing", "Variant empty set symbol"],
  ["forall", "Universal quantifier"],
  ["exists", "Existential quantifier"],
  ["neg", "Logical negation"],
  ["infty", "Infinity symbol"],
  ["Re", "Real part operator"],
  ["Im", "Imaginary part operator"],
  ["aleph", "Aleph symbol"],
  ["hbar", "Reduced Planck constant"],
] as const;

const functionCommands = [
  ["sin", "Sine function"],
  ["cos", "Cosine function"],
  ["tan", "Tangent function"],
  ["cot", "Cotangent function"],
  ["sec", "Secant function"],
  ["csc", "Cosecant function"],
  ["arcsin", "Inverse sine function"],
  ["arccos", "Inverse cosine function"],
  ["arctan", "Inverse tangent function"],
  ["sinh", "Hyperbolic sine"],
  ["cosh", "Hyperbolic cosine"],
  ["tanh", "Hyperbolic tangent"],
  ["exp", "Exponential function"],
  ["log", "Logarithm function"],
  ["ln", "Natural logarithm"],
] as const;

const fontCommands = [
  ["mathbf", "\\mathbf{}", 8, "Bold math text"],
  ["mathit", "\\mathit{}", 8, "Italic math text"],
  ["mathrm", "\\mathrm{}", 8, "Roman math text"],
  ["mathsf", "\\mathsf{}", 8, "Sans-serif math text"],
  ["mathtt", "\\mathtt{}", 8, "Monospace math text"],
  ["mathcal", "\\mathcal{}", 9, "Calligraphic math letters"],
  ["mathbb", "\\mathbb{}", 8, "Blackboard bold letters"],
  ["mathfrak", "\\mathfrak{}", 10, "Fraktur math letters"],
] as const;

const accentCommands = [
  ["hat", "\\hat{}", 5, "Hat accent"],
  ["widehat", "\\widehat{}", 9, "Wide hat accent"],
  ["tilde", "\\tilde{}", 7, "Tilde accent"],
  ["widetilde", "\\widetilde{}", 11, "Wide tilde accent"],
  ["bar", "\\bar{}", 5, "Bar accent"],
  ["overline", "\\overline{}", 10, "Overline accent"],
  ["underline", "\\underline{}", 11, "Underline accent"],
  ["vec", "\\vec{}", 5, "Vector arrow accent"],
  ["dot", "\\dot{}", 5, "Single dot accent"],
  ["ddot", "\\ddot{}", 6, "Double dot accent"],
] as const;

const delimiterTemplates = [
  ["left", "\\left(  \\right)", 7, "Scalable delimiter pair", "\\left(\\right)"],
  ["brackets", "\\left[  \\right]", 7, "Scalable bracket pair", "\\left[\\right]"],
  ["braces", "\\left\\{  \\right\\}", 9, "Scalable brace pair", "\\left\\{\\right\\}"],
  ["abs", "\\left|  \\right|", 7, "Absolute-value delimiters", "\\left|\\right|"],
  ["norm", "\\left\\lVert  \\right\\rVert", 14, "Norm delimiters", "\\left\\lVert\\right\\rVert"],
  ["ceil", "\\left\\lceil  \\right\\rceil", 14, "Ceiling delimiters", "\\left\\lceil\\right\\rceil"],
  ["floor", "\\left\\lfloor  \\right\\rfloor", 14, "Floor delimiters", "\\left\\lfloor\\right\\rfloor"],
] as const;

const textAndLayoutTemplates = [
  ["text", "\\text{}", 6, "Inline text inside math"],
  ["textbf", "\\textbf{}", 8, "Bold text inside math"],
  ["quad", "Horizontal math spacing"],
  ["qquad", "Wide horizontal math spacing"],
  ["label", "\\label{}", 7, "Equation label"],
  ["tag", "\\tag{}", 5, "Equation tag"],
] as const;

const environmentItems = [
  ["matrix", "Plain matrix environment"],
  ["pmatrix", "Parenthesized matrix"],
  ["bmatrix", "Bracketed matrix"],
  ["Bmatrix", "Brace matrix"],
  ["vmatrix", "Single-bar determinant matrix"],
  ["Vmatrix", "Double-bar matrix"],
  ["cases", "Piecewise cases environment"],
  ["aligned", "Aligned equations environment"],
  ["align", "Multiline aligned display environment"],
  ["gathered", "Grouped display equations"],
  ["split", "Equation split environment"],
  ["array", "Array environment"],
] as const;

export const mathAutocompleteItems: MathAutocompleteItem[] = [
  ...greekCommands.map(([trigger, detail]) => command(trigger, detail)),
  ...operatorCommands.map(([trigger, second, third, fourth]) =>
    typeof second === "string" && typeof third === "number" && typeof fourth === "string"
      ? template(trigger, second, third, fourth)
      : command(
          trigger,
          second as string,
          ["sum", "prod", "coprod", "int", "iint", "iiint", "oint"].includes(trigger)
            ? `\\${trigger}_{i=1}^{n}`
            : ["lim", "limsup", "liminf"].includes(trigger)
              ? `\\${trigger}_{x \\to 0}`
              : ["max", "min", "sup", "inf", "argmax", "argmin"].includes(trigger)
                ? `\\${trigger}_{x \\in A}`
                : `\\${trigger}`,
        ),
  ),
  ...relationCommands.map(([trigger, detail]) => command(trigger, detail, `x \\${trigger} y`)),
  ...binaryCommands
    .filter(([trigger], index, items) => items.findIndex(([candidate]) => candidate === trigger) === index)
    .map(([trigger, detail]) => command(trigger, detail, `x \\${trigger} y`)),
  ...arrowCommands.map(([trigger, detail]) => command(trigger, detail, `A \\${trigger} B`)),
  ...setCommands.map(([trigger, detail]) =>
    command(
      trigger,
      detail,
      ["in", "notin", "ni"].includes(trigger)
        ? `x \\${trigger} A`
        : ["forall", "exists", "neg"].includes(trigger)
          ? `\\${trigger} x`
          : `\\${trigger}`,
    ),
  ),
  ...functionCommands.map(([trigger, detail]) => command(trigger, detail, `\\${trigger}(x)`)),
  ...fontCommands.map(([trigger, insertValue, caretOffset, detail]) =>
    template(trigger, insertValue, caretOffset, detail),
  ),
  ...accentCommands.map(([trigger, insertValue, caretOffset, detail]) =>
    template(trigger, insertValue, caretOffset, detail),
  ),
  ...delimiterTemplates.map(([trigger, insertValue, caretOffset, detail, label]) =>
    template(trigger, insertValue, caretOffset, detail, label),
  ),
  ...textAndLayoutTemplates.map(([trigger, second, third, fourth]) =>
    typeof second === "string" && typeof third === "number" && typeof fourth === "string"
      ? template(trigger, second, third, fourth)
      : command(
          trigger,
          second as string,
          ["quad", "qquad"].includes(trigger) ? `x\\${trigger}y` : `\\${trigger}`,
        ),
  ),
  ...environmentItems.map(([name, detail]) => environment(name, detail)),
];
