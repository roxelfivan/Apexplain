/**
 * Write still PNGs for each scene (full reveal) and run layout check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { checkLayout, renderSceneFrame } from './engine.js';
import { displayPath, loadProject } from './project.js';
import { buildEstimatedTimeline } from './timeline.js';

export function previewProject(dir) {
  const project = loadProject(dir);
  const timeline = buildEstimatedTimeline(project);
  const stillsDir = path.join(project.paths.build, 'stills');
  fs.mkdirSync(stillsDir, { recursive: true });

  const files = [];
  const checks = [];

  for (const sc of project.script.scenes) {
    const sceneTimeline = timeline.scenes.find((s) => s.id === sc.id);
    const frame = renderSceneFrame({
      video: project.video,
      sceneId: sc.id,
      layout: project.scenes[sc.id],
      sceneTimeline,
      t: sceneTimeline?.dur ?? Infinity,
    });
    const file = path.join(stillsDir, `${sc.id}.png`);
    fs.writeFileSync(file, frame.png);
    files.push(file);
    checks.push(
      checkLayout(frame.els, {
        safe: frame.safe,
        type: frame.type,
        sceneId: sc.id,
      }),
    );
  }

  const lines = [
    `preview ${displayPath(project.paths.root)}`,
    ...files.map((f, i) => `  ${project.script.scenes[i].id}: ${displayPath(f)} (${checks[i].elements} els)`),
    `ok: layout check passed for ${checks.length} scene${checks.length === 1 ? '' : 's'}`,
  ];

  return {
    ok: true,
    dir: project.paths.root,
    files,
    checks,
    message: lines.join('\n'),
  };
}
