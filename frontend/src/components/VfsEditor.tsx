import Editor, { type Monaco } from "@monaco-editor/react";
import { useCallback } from "react";

type Stub = { name: string; contents: string };

type Props = {
  path: string | null;
  value: string;
  readOnly: boolean;
  stubs: Stub[];
  onChange: (value: string) => void;
};

function languageFor(path: string): string {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".jsx") || path.endsWith(".js")) return "javascript";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  return "plaintext";
}

export default function VfsEditor({
  path,
  value,
  readOnly,
  stubs,
  onChange,
}: Props) {
  const onMount = useCallback(
    (_editor: unknown, monaco: Monaco) => {
      // Feed signature-only stubs to the language service so imports of
      // out-of-scope modules resolve. Without this every scoped file is a wall
      // of red squiggles and developers reasonably conclude the tool is broken.
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
      <div className="editor-empty">
        <p className="muted">Select a file to begin.</p>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      path={path}
      language={languageFor(path)}
      value={value}
      onMount={onMount}
      onChange={(next) => onChange(next ?? "")}
      options={{
        readOnly,
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderWhitespace: "selection",
        tabSize: 2,
        // Quick-open would let a developer type any path and probe the repo.
        quickSuggestions: true,
        contextmenu: false,
      }}
    />
  );
}
