export interface ArchitectureCheckResult {
  errors: string[];
  packageCount: number;
  edgeCount: number;
}

export function checkArchitecture(root?: string): Promise<ArchitectureCheckResult>;
