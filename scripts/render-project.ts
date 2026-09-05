import { readFile } from "node:fs/promises";
import { renderProject } from "../workers/media/render";
if (!process.argv[2]) throw new Error("Usage: npm run render:project -- path/to/project.json [output-directory]");
const project: unknown = JSON.parse(await readFile(process.argv[2], "utf8"));
const result = await renderProject(project, process.argv[3] || "runs/project", async message => console.log(message));
console.log(JSON.stringify(result.benchmark, null, 2));
