import type { Command } from "commander";
import { showWorkspace } from "../core/workspace";
import { branchToFolderSlug } from "../utils/slug";
import { promptInput } from "../utils/prompt";

export function registerShowCommand(program: Command) {
  program
    .command("show")
    .alias("s")
    .argument("<branch-name>", "Name of the existing branch to display")
    .description("Display an existing branch as a workspace folder")
    .action(async (branchName: string) => {
      try {
        const defaultFolderName = branchToFolderSlug(branchName);
        const folderName = await promptInput("Workspace folder name", defaultFolderName);

        const result = await showWorkspace({
          branchName,
          folderName,
          cwd: process.cwd(),
        });

        if (result.usedRemoteBranch) {
          // eslint-disable-next-line no-console
          console.log(`Using remote branch "${branchName}" and displaying it locally.`);
        } else {
          // eslint-disable-next-line no-console
          console.log(`Using local branch "${branchName}" and displaying it locally.`);
        }

        // eslint-disable-next-line no-console
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error occurred";
        if (message === "branch was not found on origin or local refs") {
          // eslint-disable-next-line no-console
          console.warn(
            `\x1b[33mWarning: branch "${branchName}" was not found. ` +
              `You can create it with: gmd new ${branchName}\x1b[0m`,
          );
          process.exitCode = 1;
          return;
        }
        // eslint-disable-next-line no-console
        console.error(message);
        process.exitCode = 1;
      }
    });
}
