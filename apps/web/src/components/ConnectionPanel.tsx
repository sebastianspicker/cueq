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
    <div className="cq-section-card cq-connection-panel">
      <FormField label={props.apiBaseLabel}>
        <input
          value={props.apiBaseUrl}
          onChange={(event) => props.setApiBaseUrl(event.target.value)}
          autoComplete="off"
        />
      </FormField>
      <FormField label={props.tokenLabel}>
        <input
          type="password"
          value={props.token}
          onChange={(event) => props.setToken(event.target.value)}
          placeholder="mock.eyJzdWIiOiJjLi4uIn0"
          autoComplete="off"
        />
      </FormField>
    </div>
  );
}
