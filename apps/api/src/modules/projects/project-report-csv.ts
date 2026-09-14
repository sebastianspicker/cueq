/** Escapes project report CSV cells without exposing suppressed totals. */
export type ProjectEffortSummary = {
  projectId: string;
  code: string;
  name: string;
  parentId: string | null;
  from: string;
  to: string;
  suppression: { suppressed: boolean; minGroupSize: number; population: number };
  totals: null | {
    budgetHours: number | null;
    recordedHours: number;
    varianceHours: number | null;
  };
};

function csvCell(value: string | number | boolean | null) {
  if (value === null) return '';
  let text = String(value);
  if (/^[=+\-@]/u.test(text)) text = `'${text}`;
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function projectSummaryCsv(summary: ProjectEffortSummary) {
  const headers = [
    'projectId',
    'code',
    'name',
    'parentId',
    'from',
    'to',
    'suppressed',
    'minGroupSize',
    'population',
    'budgetHours',
    'recordedHours',
    'varianceHours',
  ];
  const values = [
    summary.projectId,
    summary.code,
    summary.name,
    summary.parentId,
    summary.from,
    summary.to,
    summary.suppression.suppressed,
    summary.suppression.minGroupSize,
    summary.suppression.population,
    summary.totals?.budgetHours ?? null,
    summary.totals?.recordedHours ?? null,
    summary.totals?.varianceHours ?? null,
  ];
  return `${headers.join(',')}\n${values.map(csvCell).join(',')}\n`;
}
