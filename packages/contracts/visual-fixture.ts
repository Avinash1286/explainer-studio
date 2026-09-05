import { projectSchema } from "./scene";
import type { VisualEntity, VisualRelation, VisualBeat, VisualKind, VisualColor } from "./visual";

const entity = (id: string, kind: VisualKind, label: string, x: number, y: number, w: number, h: number, color: VisualColor, cue = "", extra: Partial<VisualEntity> = {}): VisualEntity => ({ id, kind, label, x, y, w, h, color, cue, enter: 0, ...extra });
const relation = (id: string, from: string, to: string, label: string, cue: string, extra: Partial<VisualRelation> = {}): VisualRelation => ({ id, from, to, label, cue, type: "arrow", color: "ink", curve: 0, enter: .2, ...extra });
const beat = (id: string, target: string, action: VisualBeat["action"], cue: string, meaning: string, extra: Partial<VisualBeat> = {}): VisualBeat => ({ id, target, action, cue, meaning, at: .3, duration: .15, ...extra });

/** Hand-authored renderer calibration, never used as generated content or a topic fallback. */
export const visualFixture = projectSchema.parse({
  version: 1, id: "directed-solar-calibration-v1", title: "Solar energy — renderer calibration", origin: "validation", voice: "af_heart", speed: .95,
  scenes: [
    {
      id: "light-to-cell", layout: "relationship", title: "Light reaches the cell", takeaway: "Light carries energy.",
      narration: "Sunlight carries energy in packets called photons. When this light reaches a solar cell, some of its energy can be absorbed. Watch the light travel toward the cell. The useful change happens inside its material.",
      nodes: [{ icon: "TEXT", label: "Sunlight" }, { icon: "TEXT", label: "Photons" }, { icon: "TEXT", label: "Solar cell" }],
      visualPlan: { version: 1, grammar: "mechanism", objective: "Follow a packet of light from the sun into a solar cell, connecting incoming light to absorption.",
        entities: [entity("sun", "sun", "Sunlight", 18, 32, 18, 30, "yellow", "Sunlight"), entity("photon", "photon", "Photon", 37, 39, 12, 18, "yellow", "photons"), entity("cell", "solar-panel", "Solar cell", 70, 55, 34, 50, "blue", "solar cell")],
        relations: [relation("light-path", "sun", "cell", "Light energy", "light travel", { type: "flow", color: "orange", curve: -.15, particle: "photon" })],
        beats: [beat("travel", "photon", "move", "light travel", "The light packet moves toward the cell rather than remaining an isolated icon.", { x: 65, y: 50, duration: .22 }), beat("absorb", "cell", "pulse", "inside its material", "Emphasize the material where incoming light is absorbed.", { duration: .12 }), beat("absorbed-photon", "photon", "hide", "inside its material", "The absorbed photon and its label disappear into the cell instead of remaining on top of it.", { at: .78, duration: .07 })],
      },
    },
    {
      id: "free-charge", layout: "relationship", title: "Energy frees charge", takeaway: "Absorbed light can free an electron.",
      narration: "Inside the cell is a semiconductor. This simplified lattice represents its material. An absorbed photon can give an electron enough energy to move more freely. The blue electron moves within the material, showing mobile charge rather than an electron escaping the cell.",
      nodes: [{ icon: "TEXT", label: "Semiconductor" }, { icon: "TEXT", label: "Photon" }, { icon: "TEXT", label: "Electron" }],
      visualPlan: { version: 1, grammar: "mechanism", objective: "Show a schematic electron receiving light energy and moving between positions inside a semiconductor lattice, without implying escape into empty space.",
        entities: [entity("photon", "photon", "Photon", 16, 31, 15, 19, "yellow", "photon"), entity("material", "lattice", "Semiconductor", 47, 52, 34, 46, "purple", "semiconductor", { count: 9 }), entity("electron", "electron", "", 47, 52, 5, 8, "blue", "electron", { parentId: "material" })],
        relations: [relation("energy", "photon", "material", "Energy in", "absorbed photon", { type: "flow", color: "orange", curve: .1, particle: "photon" })],
        beats: [beat("energy-transfer", "energy", "flow", "give an electron", "Trace incoming energy into the material.", { duration: .18 }), beat("electron-moves", "electron", "move", "moves within", "Move the electron between positions within the lattice to show mobile charge remaining inside the semiconductor.", { x: 55, y: 60, duration: .24 })],
      },
    },
    {
      id: "circuit", layout: "relationship", title: "Charge moves through a circuit", takeaway: "An external circuit makes electrical energy useful.",
      narration: "The cell's built in electric field helps separate charges. With an external circuit connected, charges can flow through a device such as this bulb. Follow the complete loop back to the cell. Light energy has become electrical energy that can do useful work.",
      nodes: [{ icon: "TEXT", label: "Solar cell" }, { icon: "TEXT", label: "Circuit" }, { icon: "TEXT", label: "Bulb" }],
      visualPlan: { version: 1, grammar: "cycle", objective: "Make a complete external circuit visible, showing useful energy delivered to a bulb and a return path to the solar cell.",
        entities: [entity("cell", "solar-panel", "Solar cell", 26, 47, 26, 42, "blue", "cell"), entity("bulb", "bulb", "Bulb", 75, 47, 19, 35, "yellow", "bulb")],
        relations: [relation("outbound", "cell", "bulb", "External circuit", "external circuit", { type: "flow", color: "blue", curve: -.75, particle: "electron" }), relation("return", "bulb", "cell", "Return path", "complete loop", { type: "flow", color: "blue", curve: -.75, particle: "electron" })],
        beats: [beat("current", "outbound", "flow", "charges can flow", "Flow follows the wire toward the load.", { duration: .4 }), beat("light-on", "bulb", "transform", "this bulb", "The bulb lights when the illustrated circuit carries current.", { value: 1, duration: .15 }), beat("return-current", "return", "flow", "back to the cell", "Flow completes the external circuit instead of ending at the device.", { duration: .25 })],
      },
    },
  ],
  sources: [{ title: "U.S. Department of Energy — Solar Photovoltaic Cell Basics", url: "https://www.energy.gov/cmei/systems/solar-photovoltaic-cell-basics" }],
});
