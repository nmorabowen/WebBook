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

function normalizeLanguage(language?: string) {
  const normalized = (language ?? "text").toLowerCase();
  if (["python", "py"].includes(normalized)) {
    return "python";
  }

  if (["c++", "cpp", "cxx", "cc", "hpp", "hxx"].includes(normalized)) {
    return "cpp";
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

function tokenizeLine(line: string, language: string) {
  if (language === "python") {
    return tokenizePythonLine(line);
  }

  if (language === "cpp") {
    return tokenizeCppLine(line);
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
