import { FormField } from './FormField';

interface ConnectionPanelProps {
  apiBaseLabel: string;
  tokenLabel: string;
  apiBaseUrl: string;
  setApiBaseUrl: (value: string) => void;
  token: string;
  setToken: (value: string) => void;
}

export function ConnectionPanel(props: ConnectionPanelProps) {
  return (
    <div className="cq-section-card" style={{ display: 'grid', gap: '.75rem' }}>
      <FormField label={props.apiBaseLabel}>
        <input
          value={props.apiBaseUrl}
          onChange={(event) => props.setApiBaseUrl(event.target.value)}
        />
      </FormField>
      <FormField label={props.tokenLabel}>
        <input
          type="password"
          value={props.token}
          onChange={(event) => props.setToken(event.target.value)}
          placeholder="mock.eyJzdWIiOiJjLi4uIn0"
        />
      </FormField>
    </div>
  );
}
