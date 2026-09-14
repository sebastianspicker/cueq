'use client';

import { useId } from 'react';
import type { AssignmentContextState } from './use-assignment-context';
import type { WorkspaceMessages } from './types';

export function AssignmentSelector({
  context,
  messages,
}: {
  context: AssignmentContextState;
  messages: WorkspaceMessages;
}) {
  const id = useId();
  return (
    <div className="cq-assignment-context">
      <label htmlFor={id}>{messages.assignmentLabel}</label>
      <select
        id={id}
        value={context.selectedId ?? ''}
        disabled={context.phase === 'loading'}
        onChange={(event) => context.select(event.target.value)}
      >
        <option value="" disabled>
          {messages.assignmentRequired}
        </option>
        {context.items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
            {item.legacy ? ` · ${messages.assignmentLegacy}` : ''}
            {!item.active ? ` · ${messages.assignmentInactive}` : ''}
          </option>
        ))}
      </select>
      <span role="status">
        {context.phase === 'loading'
          ? messages.assignmentLoading
          : context.phase === 'error'
            ? messages.assignmentError
            : context.items.length === 0
              ? messages.assignmentEmpty
              : ''}
      </span>
      {context.phase === 'error' ? (
        <button type="button" className="cq-session-retry" onClick={context.retry}>
          {messages.sessionRetry}
        </button>
      ) : null}
      {context.nextCursor ? (
        <button
          type="button"
          className="cq-session-retry"
          disabled={context.phase === 'loading'}
          onClick={context.loadMore}
        >
          {messages.assignmentMore}
        </button>
      ) : null}
    </div>
  );
}
