import { DiffEditor } from "@monaco-editor/react";

type Props = {
  path: string;
  original: string;
  proposed: string;
  onAccept: () => void;
  onReject: () => void;
};

export default function DiffModal({
  path,
  original,
  proposed,
  onAccept,
  onReject,
}: Props) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-head">
          <div>
            <h3>Proposed change</h3>
            <code className="muted">{path}</code>
          </div>
          <div className="row-gap">
            <button className="ghost" onClick={onReject}>
              Discard
            </button>
            <button onClick={onAccept}>Apply to editor</button>
          </div>
        </header>
        <div className="modal-body">
          <DiffEditor
            original={original}
            modified={proposed}
            language="typescript"
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
            }}
          />
        </div>
      </div>
    </div>
  );
}
