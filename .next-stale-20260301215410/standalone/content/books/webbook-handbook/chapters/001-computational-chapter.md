---
kind: chapter
bookSlug: webbook-handbook
title: Computational Chapter
slug: computational-chapter
order: 1
summary: 'A sample chapter that mixes prose, equations, and executable Python.'
status: published
allowExecution: true
createdAt: '2026-03-02T00:05:12.254Z'
updatedAt: '2026-03-02T00:05:12.254Z'
publishedAt: '2026-03-02T00:05:12.254Z'
---
# Computational Chapter

Here is a matrix identity:

$$A^T A \succeq 0$$

And here is a live Python cell:

```python exec id=sample-cell
import sympy as sp
x = sp.symbols('x')
print(sp.integrate(x**2, x))
```
