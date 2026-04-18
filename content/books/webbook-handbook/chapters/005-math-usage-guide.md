---
title: Math Usage Guide
slug: math-usage-guide
createdAt: '2026-03-03T15:05:00.000Z'
updatedAt: '2026-04-18T19:54:29.232Z'
publishedAt: '2026-03-03T15:05:00.000Z'
kind: chapter
bookSlug: webbook-handbook
order: 5
summary: 'How to write, style, and troubleshoot MathJax equations in WebBook.'
status: published
allowExecution: false
fontPreset: source-serif
id: 1fcdff5d-2ad1-4059-8adf-5dad8cc7be72
routeAliases: []
---
# Math Usage Guide

This chapter explains how MathJax is used in WebBook and which markdown patterns work best in the editor and on the published pages.

## Inline math

Use inline math inside a sentence with single dollar signs:

```md
The stiffness relation is $K u = f$.
```

That renders as: $K u = f$.

Inline math is best for:

- symbols such as $E$, $\mu$, and $\epsilon_0$
- short expressions like $x^2 + y^2 = z^2$
- references embedded in prose

## Display equations

Use display math with double dollar signs when the equation should appear on its own line:

```md
$$
K u = f
$$
```

That renders as:

$$
K u = f
$$

Display math is best for:

- longer derivations
- matrices
- aligned equations
- equations with tags

## Common environments

WebBook supports normal MathJax and LaTeX-style math environments. Common examples include:

### Fractions and roots

```md
$$
\frac{a+b}{c}, \qquad \sqrt{x^2 + y^2}
$$
```

### Matrices

```md
$$
\begin{bmatrix}
1 & 0 \\
0 & 1
\end{bmatrix}
$$
```

### Cases

```md
$$
f(x)=
\begin{cases}
x^2 & x \ge 0 \\
-x & x < 0
\end{cases}
$$
```

### Aligned equations

```md
$$
\begin{aligned}
\sigma &= E \epsilon \\
\tau &= G \gamma
\end{aligned}
$$
```

### Equation tags

```md
$$
K u = f
\tag{1}
$$
```

## Editor shortcuts

WebBook supports dedicated math shortcuts:

- `Ctrl+E` for inline math
- `Ctrl+Shift+E` for block math

If text is selected, the selection is wrapped. If no text is selected, the editor inserts an empty wrapper so you can type your own expression directly.

## Math autocomplete

When typing inside math, WebBook suggests MathJax and LaTeX commands automatically.

Examples:

- `\alpha`
- `\beta`
- `\frac`
- `\sqrt`
- `\mathbf`
- `\mathbb`
- `\mathcal`
- `\sum`
- `\int`
- `\begin{bmatrix}`

The suggestion popup also shows a rendered preview beside each command so you can see the output before inserting it.

## Useful patterns

### Vectors and bold symbols

```md
$\mathbf{K}$, $\mathbf{u}$, $\vec{v}$
```

### Blackboard and calligraphic symbols

```md
$\mathbb{R}$, $\mathcal{F}$
```

### Text inside equations

```md
$$
\sigma_x = 0 \qquad \text{for plane stress}
$$
```

### Partial derivatives

```md
$$
\epsilon_x = \frac{\partial u}{\partial x}
$$
```

## Recommended writing style

For the cleanest results in WebBook:

1. Keep inline equations short.
2. Move long derivations into display blocks.
3. Put one major matrix or aligned derivation per display block.
4. Use `\text{...}` instead of raw words inside equations.
5. Prefer standard MathJax environments such as `bmatrix`, `cases`, and `aligned`.

## Troubleshooting

### Inline math looks too high or too low

WebBook exposes inline equation positioning controls in `General settings -> MathJax styling`. Those settings let you tune:

- inline equation baseline offset
- inline equation vertical nudge

### The equation shows as raw text

Check the delimiters first:

- inline math must use `$...$`
- display math must use `$$ ... $$`

Also make sure the backslashes are present in commands like `\frac`, `\mu`, and `\begin{bmatrix}`.

### A long equation feels cramped

Use a display block instead of inline math, or split the equation with `aligned`.

### I want exact visual control

Use the global MathJax controls in General settings for:

- equation font family
- equation size
- equation color
- inline equation position

## Example

Here is a typical technical block that works well in WebBook:

```md
Para un material isotrópico lineal:

$$
\begin{Bmatrix}
\epsilon_x \\
\epsilon_y \\
\gamma_{xy}
\end{Bmatrix}
=
\begin{bmatrix}
1/E & -\mu/E & 0 \\
-\mu/E & 1/E & 0 \\
0 & 0 & 1/G
\end{bmatrix}
\begin{Bmatrix}
\sigma_x \\
\sigma_y \\
\tau_{xy}
\end{Bmatrix}
\tag{1}
$$
```

That pattern is the recommended model for longer engineering expressions in WebBook.
