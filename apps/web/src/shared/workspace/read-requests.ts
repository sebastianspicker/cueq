import type { ApiRequest } from '../../platform/http/api-client';

/** One generation per resource; invalidation also works with transports ignoring abort. */
export class WorkspaceReadRequests {
  private readonly active = new Map<string, AbortController>();
  private disposed = false;
  private feedbackGeneration = 0;

  constructor(private readonly apiRequest: ApiRequest) {}

  begin(resource: string, preserveFeedback = false) {
    if (!preserveFeedback) this.feedbackGeneration += 1;
    const feedbackGeneration = this.feedbackGeneration;
    this.active.get(resource)?.abort();
    const controller = new AbortController();
    if (this.disposed) controller.abort();
    this.active.set(resource, controller);
    const isCurrent = () => !controller.signal.aborted && this.active.get(resource) === controller;
    const request: ApiRequest = (path, schema, init) => {
      const isRead = !init?.method || init.method === 'GET';
      if (isRead && !isCurrent()) {
        return Promise.reject(new DOMException('Request superseded', 'AbortError'));
      }
      return this.apiRequest(path, schema, isRead ? { ...init, signal: controller.signal } : init);
    };
    return {
      request,
      isCurrent,
      isFeedbackCurrent: () => isCurrent() && feedbackGeneration === this.feedbackGeneration,
      cancel: () => {
        if (isCurrent()) this.active.delete(resource);
        controller.abort();
      },
      finish: () => {
        if (isCurrent()) this.active.delete(resource);
      },
    };
  }

  get pending() {
    return this.active.size > 0 && !this.disposed;
  }

  resume() {
    this.disposed = false;
  }

  dispose() {
    this.disposed = true;
    for (const controller of this.active.values()) controller.abort();
    this.active.clear();
  }
}
