import { memo, useState, useCallback } from 'react';
import { Markdown } from './Markdown';
import { Artifact } from './Artifact';

interface AssistantMessageProps {
  content: string;
}

export const AssistantMessage = memo(({ content }: AssistantMessageProps) => {
  // Collect artifact IDs encountered during markdown render (deduped)
  const [artifactIds, setArtifactIds] = useState<string[]>([]);
  const onArtifact = useCallback((id: string) => {
    // Deduplicate while preserving discovery order
    setArtifactIds(prev => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  return (
    <div className="overflow-hidden w-full">
      <Markdown html onArtifact={onArtifact}>{content}</Markdown>
      {/* Always append artifacts at the end of the assistant message */}
      {artifactIds.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {artifactIds.map(id => (
            <Artifact key={id} messageId={id} />
          ))}
        </div>
      )}
    </div>
  );
});
