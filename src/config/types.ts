export interface ProjectConfig {
  version: 1;
  projectName: string;
  remote: string;
  defaultBaseBranch: string;
}

export interface WorkspaceEntry {
  branch: string;
  folderName: string;
  goal: string;
}

export interface ProjectState {
  defaultBaseBranch: string;
  workspaces: WorkspaceEntry[];
}
