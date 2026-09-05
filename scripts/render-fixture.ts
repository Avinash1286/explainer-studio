import { renderFixture } from "../workers/media/render";
const result = await renderFixture(process.argv[2] || "runs/fixture", async message => { console.log(message); });
console.log(JSON.stringify(result.benchmark, null, 2));
