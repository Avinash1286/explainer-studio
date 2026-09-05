import { projectSchema } from "./scene";

// A hand-authored renderer fixture. Never substitute this for a user's topic.
export const fixture = projectSchema.parse({
  version: 1, id: "plant-energy-v1", title: "How plants turn light into food", voice: "af_heart", speed: 0.9,
  scenes: [
    { id: "capture", layout: "process", title: "Light becomes stored energy", narration: "Plants capture sunlight in their leaves. They use this energy to turn water and carbon dioxide into sugars.", nodes: [{ icon: "2600", label: "Sunlight", cue: "sunlight" }, { icon: "1F343", label: "Leaves", cue: "leaves" }, { icon: "1F36C", label: "Sugars", cue: "sugars" }], takeaway: "Photosynthesis stores energy in sugars." },
    { id: "compare", layout: "comparison", title: "Energy has different forms", narration: "Sunlight provides energy. Sugar stores chemical energy that the plant can use, even when the sun is gone.", nodes: [{ icon: "2600", label: "Light energy", cue: "sunlight" }, { icon: "1F36C", label: "Chemical energy", cue: "sugar" }], takeaway: "The candy icon is a symbol for sugar molecules." },
    { id: "connect", layout: "relationship", title: "Stored energy supports growth", narration: "The plant uses sugars for energy and building material. This supports new roots, stems, and leaves.", nodes: [{ icon: "1F36C", label: "Sugars", cue: "sugars" }, { icon: "1F331", label: "Plant growth", cue: "supports" }, { icon: "1F343", label: "New leaves", cue: "leaves" }], takeaway: "A little light helps a plant grow." },
  ],
  sources: [{ title: "OpenStax Biology 2e — Overview of photosynthesis", url: "https://openstax.org/books/biology-2e/pages/8-1-overview-of-photosynthesis" }],
});
