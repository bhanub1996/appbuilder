import type { StorySummary } from "../api/client";

export default function StoryPane({
  story,
  branch,
  stale,
}: {
  story: StorySummary;
  branch: string;
  stale: boolean;
}) {
  return (
    <div className="panel">
      <div className="story-key">{story.key}</div>
      <h2>{story.title}</h2>
      {story.developer_brief && <p>{story.developer_brief}</p>}
      {story.acceptance_criteria.length > 0 && (
        <>
          <h4>Acceptance criteria</h4>
          <ul className="criteria">
            {story.acceptance_criteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}
      <p className="fine-print">
        Branch <code>{branch}</code>
      </p>
      {stale && (
        <div className="notice notice-warn">
          A dependency changed on the base branch. Refresh context before your
          next AI request.
        </div>
      )}
    </div>
  );
}
