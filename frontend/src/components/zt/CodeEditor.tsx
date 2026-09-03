import Editor, { DiffEditor, type Monaco } from "@monaco-editor/react";
import { FileQuestion } from "lucide-react";
import { useCallback } from "react";

export type Stub = { name: string; contents: string };

export function languageFor(path: string): string {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".jsx") || path.endsWith(".js")) return "javascript";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".sql")) return "sql";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  return "plaintext";
}

const THEME = "zero-trust";

/** Slate canvas + amber signal, matched to the app tokens. */
export function defineTheme(monaco: Monaco) {
  monaco.editor.defineTheme(THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "64748b", fontStyle: "italic" },
      { token: "keyword", foreground: "f59e0b" },
      { token: "string", foreground: "93c5fd" },
      { token: "number", foreground: "fcd34d" },
      { token: "type", foreground: "7dd3fc" },
      { token: "function", foreground: "e2e8f0" },
    ],
    colors: {
      "editor.background": "#0F172A",
      "editor.foreground": "#e2e8f0",
      "editorLineNumber.foreground": "#334155",
      "editorLineNumber.activeForeground": "#f59e0b",
      "editor.selectionBackground": "#33415588",
      "editor.lineHighlightBackground": "#1e293b66",
      "editorCursor.foreground": "#f59e0b",
      "editorIndentGuide.background1": "#1e293b",
      "editorIndentGuide.activeBackground1": "#334155",
      "editorGutter.background": "#0F172A",
      "diffEditor.insertedTextBackground": "#22c55e22",
      "diffEditor.removedTextBackground": "#ef444422",
      "scrollbarSlider.background": "#33415577",
    },
  });
}

type Props = {
  path: string | null;
  value: string;
  readOnly: boolean;
  stubs: Stub[];
  onChange: (value: string) => void;
};

export default function CodeEditor({
  path,
  value,
  readOnly,
  stubs,
  onChange,
}: Props) {
  const onMount = useCallback(
    (_editor: unknown, monaco: Monaco) => {
      defineTheme(monaco);
      monaco.editor.setTheme(THEME);

      // Signature-only stubs keep the language service happy for imports that
      // resolve to files outside this story's scope.
      const ts = monaco.languages.typescript.typescriptDefaults;
      ts.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        jsx: monaco.languages.typescript.JsxEmit.React,
        moduleResolution:
          monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        allowNonTsExtensions: true,
        noEmit: true,
      });
      for (const stub of stubs) {
        ts.addExtraLib(stub.contents, stub.name);
      }
    },
    [stubs],
  );

  if (!path) {
    return (
      <div className="grid-canvas flex h-full flex-col items-center justify-center gap-3 text-center">
        <FileQuestion className="size-7 text-muted-foreground/50" />
        <div>
          <p className="font-display text-sm text-foreground">
            No file open
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Pick a file from the scoped tree. Nothing outside this story's scope
            can be opened, searched, or guessed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      path={path}
      language={languageFor(path)}
      value={value}
      theme={THEME}
      onMount={onMount}
      onChange={(next) => onChange(next ?? "")}
      loading={
        <span className="font-mono text-xs text-muted-foreground">
          loading editor…
        </span>
      }
      options={{
        readOnly,
        fontSize: 13,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontLigatures: true,
        lineHeight: 1.7,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderWhitespace: "selection",
        padding: { top: 16, bottom: 24 },
        tabSize: 2,
        smoothScrolling: true,
        quickSuggestions: true,
        // Quick-open / context menu would let a developer probe arbitrary paths.
        contextmenu: false,
      }}
    />
  );
}

export function CodeDiff({
  original,
  proposed,
  language,
}: {
  original: string;
  proposed: string;
  language: string;
}) {
  return (
    <DiffEditor
      height="100%"
      original={original}
      modified={proposed}
      language={language}
      theme={THEME}
      onMount={(_e, monaco) => {
        defineTheme(monaco);
        monaco.editor.setTheme(THEME);
      }}
      options={{
        readOnly: true,
        renderSideBySide: true,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        lineHeight: 1.7,
        scrollBeyondLastLine: false,
      }}
    />
  );
}
