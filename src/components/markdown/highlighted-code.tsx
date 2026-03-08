"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";

type HighlightedCodeProps = {
  code: string;
  language?: string;
  className?: string;
};

type TokenKind =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "type"
  | "function"
  | "decorator"
  | "preprocessor";

type Token = {
  kind: TokenKind;
  value: string;
};

const PYTHON_KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "False",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "None",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "True",
  "try",
  "while",
  "with",
  "yield",
]);

const CPP_KEYWORDS = new Set([
  "alignas",
  "alignof",
  "auto",
  "bool",
  "break",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "consteval",
  "constexpr",
  "constinit",
  "continue",
  "default",
  "delete",
  "do",
  "double",
  "else",
  "enum",
  "explicit",
  "export",
  "extern",
  "false",
  "float",
  "for",
  "friend",
  "goto",
  "if",
  "inline",
  "int",
  "long",
  "mutable",
  "namespace",
  "new",
  "noexcept",
  "nullptr",
  "operator",
  "private",
  "protected",
  "public",
  "register",
  "return",
  "short",
  "signed",
  "sizeof",
  "static",
  "struct",
  "switch",
  "template",
  "this",
  "throw",
  "true",
  "try",
  "typedef",
  "typename",
  "union",
  "unsigned",
  "using",
  "virtual",
  "void",
  "volatile",
  "while",
]);

const CPP_TYPES = new Set([
  "std",
  "size_t",
  "string",
  "vector",
  "map",
  "set",
  "unordered_map",
  "unique_ptr",
  "shared_ptr",
  "optional",
]);

const BASH_KEYWORDS = new Set([
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "for",
  "while",
  "until",
  "do",
  "done",
  "case",
  "esac",
  "in",
  "function",
  "select",
  "time",
  "coproc",
  "local",
  "readonly",
  "declare",
  "typeset",
  "export",
  "unset",
  "return",
  "break",
  "continue",
  "shift",
  "source",
]);

const POWERSHELL_KEYWORDS = new Set([
  "if",
  "elseif",
  "else",
  "switch",
  "foreach",
  "for",
  "while",
  "do",
  "until",
  "function",
  "filter",
  "param",
  "begin",
  "process",
  "end",
  "return",
  "break",
  "continue",
  "try",
  "catch",
  "finally",
  "trap",
  "throw",
  "class",
  "enum",
  "in",
]);

const TCL_KEYWORDS = new Set([
  "if",
  "elseif",
  "else",
  "then",
  "for",
  "foreach",
  "while",
  "switch",
  "proc",
  "return",
  "break",
  "continue",
  "set",
  "unset",
  "global",
  "variable",
  "namespace",
  "expr",
]);

function normalizeLanguage(language?: string) {
  const normalized = (language ?? "text").toLowerCase();
  if (["python", "py"].includes(normalized)) {
    return "python";
  }

  if (["c++", "cpp", "cxx", "cc", "hpp", "hxx"].includes(normalized)) {
    return "cpp";
  }

  if (["bash", "sh", "shell", "zsh"].includes(normalized)) {
    return "bash";
  }

  if (["powershell", "pwsh", "ps1", "psm1"].includes(normalized)) {
    return "powershell";
  }

  if (["tcl", "tk"].includes(normalized)) {
    return "tcl";
  }

  return "text";
}

function takeQuoted(text: string, quote: string) {
  let index = 1;

  while (index < text.length) {
    const char = text[index];
    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === quote) {
      return text.slice(0, index + 1);
    }

    index += 1;
  }

  return text;
}

function consumeIdentifier(text: string) {
  const match = text.match(/^[A-Za-z_][A-Za-z0-9_]*/);
  return match?.[0] ?? "";
}

function consumeNumber(text: string) {
  const match = text.match(/^(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
  return match?.[0] ?? "";
}

function consumeCommandIdentifier(text: string) {
  const match = text.match(/^[A-Za-z_][A-Za-z0-9_.:-]*/);
  return match?.[0] ?? "";
}

function consumeShellVariable(text: string, language: "bash" | "powershell" | "tcl") {
  if (language === "powershell") {
    const braced = text.match(/^\$\{[^}]+\}/)?.[0];
    if (braced) {
      return braced;
    }

    const scoped =
      text.match(/^\$[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)?/)?.[0];
    if (scoped) {
      return scoped;
    }
  }

  if (language === "bash") {
    const braced = text.match(/^\$\{[^}]+\}/)?.[0];
    if (braced) {
      return braced;
    }

    const positional = text.match(/^\$(?:[#?*!@$0-9]|[A-Za-z_][A-Za-z0-9_]*)/)?.[0];
    if (positional) {
      return positional;
    }
  }

  if (language === "tcl") {
    const variable = text.match(/^\$[A-Za-z_][A-Za-z0-9_:]*/)?.[0];
    if (variable) {
      return variable;
    }
  }

  return "";
}

function tokenizePythonLine(line: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  let expectFunction = false;
  let expectClass = false;

  while (cursor < line.length) {
    const slice = line.slice(cursor);

    if (slice.startsWith("#")) {
      tokens.push({ kind: "comment", value: slice });
      break;
    }

    if (slice.startsWith("@")) {
      const decorator = slice.match(/^@[A-Za-z_][A-Za-z0-9_.]*/)?.[0];
      if (decorator) {
        tokens.push({ kind: "decorator", value: decorator });
        cursor += decorator.length;
        continue;
      }
    }

    if (slice[0] === "'" || slice[0] === '"') {
      const stringValue = takeQuoted(slice, slice[0]);
      tokens.push({ kind: "string", value: stringValue });
      cursor += stringValue.length;
      continue;
    }

    const numberValue = consumeNumber(slice);
    if (numberValue) {
      tokens.push({ kind: "number", value: numberValue });
      cursor += numberValue.length;
      continue;
    }

    const identifier = consumeIdentifier(slice);
    if (identifier) {
      if (expectFunction) {
        tokens.push({ kind: "function", value: identifier });
        expectFunction = false;
        cursor += identifier.length;
        continue;
      }

      if (expectClass) {
        tokens.push({ kind: "type", value: identifier });
        expectClass = false;
        cursor += identifier.length;
        continue;
      }

      if (PYTHON_KEYWORDS.has(identifier)) {
        tokens.push({ kind: "keyword", value: identifier });
        expectFunction = identifier === "def";
        expectClass = identifier === "class";
      } else {
        tokens.push({ kind: "plain", value: identifier });
      }
      cursor += identifier.length;
      continue;
    }

    tokens.push({ kind: "plain", value: slice[0] });
    cursor += 1;
  }

  return tokens;
}

function tokenizeCppLine(line: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  let expectFunction = false;

  if (/^\s*#/.test(line)) {
    return [{ kind: "preprocessor", value: line }];
  }

  while (cursor < line.length) {
    const slice = line.slice(cursor);

    if (slice.startsWith("//")) {
      tokens.push({ kind: "comment", value: slice });
      break;
    }

    if (slice.startsWith("/*")) {
      const endIndex = slice.indexOf("*/");
      const commentValue = endIndex >= 0 ? slice.slice(0, endIndex + 2) : slice;
      tokens.push({ kind: "comment", value: commentValue });
      cursor += commentValue.length;
      continue;
    }

    if (slice[0] === "'" || slice[0] === '"') {
      const stringValue = takeQuoted(slice, slice[0]);
      tokens.push({ kind: "string", value: stringValue });
      cursor += stringValue.length;
      continue;
    }

    const numberValue = consumeNumber(slice);
    if (numberValue) {
      tokens.push({ kind: "number", value: numberValue });
      cursor += numberValue.length;
      continue;
    }

    const identifier = consumeIdentifier(slice);
    if (identifier) {
      if (expectFunction) {
        tokens.push({ kind: "function", value: identifier });
        expectFunction = false;
        cursor += identifier.length;
        continue;
      }

      if (CPP_KEYWORDS.has(identifier)) {
        tokens.push({ kind: "keyword", value: identifier });
      } else if (CPP_TYPES.has(identifier)) {
        tokens.push({ kind: "type", value: identifier });
      } else {
        tokens.push({ kind: "plain", value: identifier });
      }

      const nextChar = slice[identifier.length];
      if (nextChar === "(") {
        const previousToken = tokens[tokens.length - 1];
        if (previousToken.kind === "plain") {
          previousToken.kind = "function";
        }
      }

      cursor += identifier.length;
      continue;
    }

    tokens.push({ kind: "plain", value: slice[0] });
    cursor += 1;
  }

  return tokens;
}

function tokenizeCommandLine(
  line: string,
  language: "bash" | "powershell" | "tcl",
): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  let expectCommand = true;
  let expectFunction = false;
  const keywords =
    language === "bash"
      ? BASH_KEYWORDS
      : language === "powershell"
        ? POWERSHELL_KEYWORDS
        : TCL_KEYWORDS;

  while (cursor < line.length) {
    const slice = line.slice(cursor);

    if (slice.startsWith("#")) {
      tokens.push({ kind: "comment", value: slice });
      break;
    }

    if (slice.startsWith('"') || slice.startsWith("'")) {
      const stringValue = takeQuoted(slice, slice[0]);
      tokens.push({ kind: "string", value: stringValue });
      cursor += stringValue.length;
      expectCommand = false;
      continue;
    }

    if (language === "powershell" && slice.startsWith("`")) {
      const escaped = slice.match(/^`./)?.[0] ?? "`";
      tokens.push({ kind: "string", value: escaped });
      cursor += escaped.length;
      expectCommand = false;
      continue;
    }

    const variableValue = consumeShellVariable(slice, language);
    if (variableValue) {
      tokens.push({ kind: "type", value: variableValue });
      cursor += variableValue.length;
      expectCommand = false;
      continue;
    }

    const numberValue = consumeNumber(slice);
    if (numberValue) {
      tokens.push({ kind: "number", value: numberValue });
      cursor += numberValue.length;
      expectCommand = false;
      continue;
    }

    if (
      slice.startsWith("&&") ||
      slice.startsWith("||") ||
      slice.startsWith("|") ||
      slice.startsWith(";")
    ) {
      const operator = slice.startsWith("&&") || slice.startsWith("||") ? slice.slice(0, 2) : slice[0];
      tokens.push({ kind: "plain", value: operator });
      cursor += operator.length;
      expectCommand = true;
      continue;
    }

    if (/^\s/.test(slice[0])) {
      tokens.push({ kind: "plain", value: slice[0] });
      cursor += 1;
      continue;
    }

    if (slice.startsWith("-")) {
      const option = slice.match(/^-[A-Za-z0-9_.:-]+/)?.[0] ?? "-";
      tokens.push({ kind: "decorator", value: option });
      cursor += option.length;
      expectCommand = false;
      continue;
    }

    const identifier = consumeCommandIdentifier(slice) || consumeIdentifier(slice);
    if (identifier) {
      if (expectFunction) {
        tokens.push({ kind: "function", value: identifier });
        expectFunction = false;
        cursor += identifier.length;
        expectCommand = false;
        continue;
      }

      if (keywords.has(identifier)) {
        tokens.push({ kind: "keyword", value: identifier });
        expectFunction =
          (language === "bash" && identifier === "function") ||
          (language === "powershell" && identifier === "function") ||
          (language === "tcl" && identifier === "proc");
      } else if (expectCommand) {
        tokens.push({ kind: "function", value: identifier });
      } else {
        tokens.push({ kind: "plain", value: identifier });
      }

      cursor += identifier.length;
      expectCommand = false;
      continue;
    }

    tokens.push({ kind: "plain", value: slice[0] });
    cursor += 1;
  }

  return tokens;
}

function tokenizeLine(line: string, language: string) {
  if (language === "python") {
    return tokenizePythonLine(line);
  }

  if (language === "cpp") {
    return tokenizeCppLine(line);
  }

  if (language === "bash" || language === "powershell" || language === "tcl") {
    return tokenizeCommandLine(line, language);
  }

  return [{ kind: "plain", value: line }];
}

export function HighlightedCode({
  code,
  language,
  className,
}: HighlightedCodeProps) {
  const normalizedLanguage = normalizeLanguage(language);
  const lines = code.split("\n");

  return (
    <code
      className={cn("highlighted-code", className)}
      data-code-language={normalizedLanguage}
    >
      {lines.map((line, lineIndex) => (
        <Fragment key={`line-${lineIndex}`}>
          {tokenizeLine(line, normalizedLanguage).map((token, tokenIndex) => (
            <span
              key={`token-${lineIndex}-${tokenIndex}`}
              className={
                token.kind === "plain"
                  ? undefined
                  : `token token-${token.kind}`
              }
            >
              {token.value}
            </span>
          ))}
          {lineIndex < lines.length - 1 ? "\n" : null}
        </Fragment>
      ))}
    </code>
  );
}
