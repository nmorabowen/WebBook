import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HighlightedCode } from "./highlighted-code";

describe("HighlightedCode", () => {
  it("normalizes bash aliases for syntax highlighting", () => {
    const html = renderToStaticMarkup(
      <HighlightedCode code={'echo "hi"'} language="sh" />,
    );

    expect(html).toContain('data-code-language="bash"');
    expect(html).toContain('token token-function');
    expect(html).toContain('token token-string');
  });

  it("highlights powershell commands, variables, and options", () => {
    const html = renderToStaticMarkup(
      <HighlightedCode
        code={'Get-ChildItem -Path $env:TEMP # temp files'}
        language="powershell"
      />,
    );

    expect(html).toContain('data-code-language="powershell"');
    expect(html).toContain(">Get-ChildItem<");
    expect(html).toContain('token token-decorator');
    expect(html).toContain('token token-type');
    expect(html).toContain('token token-comment');
  });

  it("highlights tcl procedure declarations", () => {
    const html = renderToStaticMarkup(
      <HighlightedCode code={'proc greet {name} { puts "hi" }'} language="tcl" />,
    );

    expect(html).toContain('data-code-language="tcl"');
    expect(html).toContain('token token-keyword');
    expect(html).toContain(">greet<");
    expect(html).toContain('token token-string');
  });
});
