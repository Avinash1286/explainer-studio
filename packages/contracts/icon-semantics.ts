import manifest from "../../public/openmoji/manifest.json";
const aliases: Record<string, string[]> = {
    sun: ["sun", "sunlight", "sunshine"], cloud: ["cloud", "clouds"], gear: ["gear", "gears"],
    leaf: ["leaf", "leaves"], seedling: ["seedling", "seedlings", "plant", "plants", "sprout", "sprouts"],
    candy: ["candy", "sugar"], water: ["water", "rain", "droplet", "droplets"], earth: ["earth", "planet", "world"],
    dna: ["dna", "genes"], brain: ["brain"], battery: ["battery", "batteries"], "light bulb": ["bulb"],
    "test tube": ["tube", "tubes"], thermometer: ["thermometer"], microscope: ["microscope"], books: ["book", "books"],
    "sun face": ["sun", "sunlight"], moon: ["moon"], tree: ["tree", "trees"], sunflower: ["flower", "flowers", "sunflower"],
    bee: ["bee", "bees"], butterfly: ["butterfly", "butterflies"], house: ["house", "home"], car: ["car", "cars"],
  };
export const iconOptions = manifest.entries.map(({ id, name }) => ({ id, name, label: name === "sunflower" ? "Flower" : name === "sun face" ? "Sun" : name === "dna" ? "DNA" : name[0].toUpperCase() + name.slice(1), cues: aliases[name] }));
