/**
 * Generates src/lib/graph-data.json at build time.
 * Produces nodes (topics) and edges (prerequisite + Jaccard similarity).
 */
import fs from "node:fs";
import path from "node:path";

const TOPICS_DIR = path.resolve("src/content/topics");
const OUTPUT_PATH = path.resolve("src/lib/graph-data.json");
const SIMILARITY_THRESHOLD = 0.2;

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  const lines = match[1].split("\n");

  const parseBracketArray = (value) =>
    value
      .replace(/[\[\]]/g, "")
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      const [, key, val] = kvMatch;
      if (val.startsWith("[")) {
        const arrayLines = [val];
        while (!arrayLines.join("\n").includes("]") && i + 1 < lines.length) {
          i += 1;
          arrayLines.push(lines[i]);
        }
        fm[key] = parseBracketArray(arrayLines.join("\n"));
      } else if (val === "") {
        const nextLine = lines[i + 1]?.trim() ?? "";
        if (nextLine.startsWith("[")) {
          const arrayLines = [];
          while (i + 1 < lines.length) {
            i += 1;
            arrayLines.push(lines[i]);
            if (lines[i].includes("]")) break;
          }
          fm[key] = parseBracketArray(arrayLines.join("\n"));
        } else {
          const arrayItems = [];
          while (i + 1 < lines.length && lines[i + 1].match(/^\s+-\s/)) {
            i += 1;
            arrayItems.push(lines[i].replace(/^\s+-\s*["']?|["']?\s*$/g, ""));
          }
          fm[key] = arrayItems;
        }
      } else {
        fm[key] = val.replace(/^["']|["']$/g, "");
      }
    }
  }
  return fm;
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function generateGraphData() {
  const files = fs.readdirSync(TOPICS_DIR).filter((f) => f.endsWith(".md"));
  const nodes = [];
  const edges = [];

  // Parse all topics
  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const content = fs.readFileSync(path.join(TOPICS_DIR, file), "utf-8");
    const fm = parseFrontmatter(content);
    nodes.push({
      id: slug,
      title: fm.title || slug,
      category: fm.category || "classical-ml",
      difficulty: fm.difficulty || "beginner",
      domains: fm.domains || [],
      tags: fm.tags || [],
      prerequisites: fm.prerequisites || [],
    });
  }

  // Prerequisite edges (directed)
  for (const node of nodes) {
    for (const prereq of node.prerequisites) {
      if (nodes.some((n) => n.id === prereq)) {
        edges.push({ source: prereq, target: node.id, type: "prerequisite" });
      }
    }
  }

  // Jaccard similarity edges (undirected) over combined domains + tags
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = [...nodes[i].domains, ...nodes[i].tags];
      const b = [...nodes[j].domains, ...nodes[j].tags];
      const sim = jaccard(a, b);
      if (sim >= SIMILARITY_THRESHOLD) {
        edges.push({
          source: nodes[i].id,
          target: nodes[j].id,
          type: "similarity",
          weight: Math.round(sim * 100) / 100,
        });
      }
    }
  }

  const graphData = { nodes, edges };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(graphData, null, 2));
  return graphData;
}

// Run as script
generateGraphData();
console.log("Generated graph-data.json");
