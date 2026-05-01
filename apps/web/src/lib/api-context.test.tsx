import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiProvider, useApiContext } from './api-context';

function ContextProbe() {
  const { apiBaseUrl, setApiBaseUrl, token, setToken } = useApiContext();

  return (
    <div>
      <output data-testid="api-base">{apiBaseUrl}</output>
      <output data-testid="token">{token}</output>
      <button type="button" onClick={() => setToken('fresh-token')}>
        Set token
      </button>
      <button type="button" onClick={() => setApiBaseUrl('http://127.0.0.1:3001/')}>
        Set API base URL
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <ApiProvider>
      <ContextProbe />
    </ApiProvider>,
  );
}

describe('ApiProvider storage behavior', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('ignores and clears a legacy persisted bearer token', async () => {
    sessionStorage.setItem('cq-token', 'legacy-token');

    renderProvider();

    expect(screen.getByTestId('token')).toBeEmptyDOMElement();
    await waitFor(() => expect(sessionStorage.getItem('cq-token')).toBeNull());
  });

  it('keeps setToken values in memory only', async () => {
    const user = userEvent.setup();

    renderProvider();
    await user.click(screen.getByRole('button', { name: 'Set token' }));

    expect(screen.getByTestId('token')).toHaveTextContent('fresh-token');
    expect(sessionStorage.getItem('cq-token')).toBeNull();
  });

  it('still persists the API base URL', async () => {
    const user = userEvent.setup();

    renderProvider();
    await user.click(screen.getByRole('button', { name: 'Set API base URL' }));

    expect(screen.getByTestId('api-base')).toHaveTextContent('http://127.0.0.1:3001');
    expect(sessionStorage.getItem('cq-api-base-url')).toBe('http://127.0.0.1:3001');
  });
});
