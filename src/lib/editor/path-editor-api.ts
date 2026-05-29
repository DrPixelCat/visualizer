import { InterpolationStyle } from "@/lib/geometry";
import type { BuiltPath, EditorPath, EditorPose, EditorTurn } from "@/lib/editor/path-editor-types";

// Converts editor state into the Java-style fluent API preview.
export function formatStyle(style: InterpolationStyle): string {
  return style
    .split("_")
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(" ");
}

export function buildAllApiPreview(
  paths: EditorPath[],
  turns: EditorTurn[],
  builtPaths: BuiltPath[],
  favoritePoses: EditorPose[] = [],
): string {
  const usedNames = new Set<string>();
  const pathVariables = new Map<string, string>();
  const favoriteVariables = new Map<string, string>();
  const factoryLines = [
    "private final DistUnit distUnit = DistUnit.IN;",
    "private final AngleUnit angleUnit = AngleUnit.DEG;",
    "public PoseFactory pose = new PoseFactory(distUnit, angleUnit);",
  ];
  const favoriteLines = favoritePoses.map((pose) => {
    const base = /^pose\d+$/i.test(pose.name) ? "favoritePose" : toCamelIdentifier(pose.name);
    const variable = uniqueName(base || "favoritePose", usedNames);
    favoriteVariables.set(pose.id, variable);
    return `Pose ${variable} = ${formatFavoritePose(pose)};`;
  });
  const pathLines = paths
    .map((path, index) => {
      const built = builtPaths.find((item) => item.path.id === path.id);
      const variable = uniqueName(toCamelIdentifier(path.name) || `path${index + 1}`, usedNames);
      pathVariables.set(path.id, variable);
      return buildApiPreview(path, built?.segment?.getLengthIn() ?? 0, variable, favoriteVariables);
    });
  const turnLines = turns.map((turn, index) => {
    const variable = uniqueName(toCamelIdentifier(turn.name) || `turn${index + 1}`, usedNames);
    return buildTurnPreview(turn, variable, pathVariables);
  });
  return [factoryLines.join("\n"), ...favoriteLines, ...pathLines, ...turnLines].join("\n\n");
}

function buildApiPreview(
  path: EditorPath,
  lengthIn: number,
  variableName: string,
  favoriteVariables: Map<string, string>,
): string {
  const [startPose, ...controlPoses] = path.poses;
  const lines = [
    `Path ${variableName} = new PathBuilder(${formatPose(startPose, true, favoriteVariables)})`,
  ];

  lines.push("  .addControlPoints(");
  controlPoses.forEach((pose, index) => {
    const suffix = index === controlPoses.length - 1 ? "" : ",";
    const isEndPose = index === controlPoses.length - 1;
    lines.push(`    ${formatPose(pose, isEndPose, favoriteVariables)}${suffix}`);
  });
  lines.push("  )");

  if (path.interpolation === InterpolationStyle.TANGENT_CUSTOM) {
    lines.push(
      `  .interpolateWith(InterpolationStyle.TANGENT_CUSTOM, Angle.fromDeg(${formatNumber(path.tangentOffsetDeg)}))`,
    );
  } else if (path.interpolation === InterpolationStyle.CUSTOM_DIST_FUNCTION) {
    lines.push(`  .interpolateWith(${path.customFunctionSource})`);
  } else {
    lines.push(`  .interpolateWith(InterpolationStyle.${path.interpolation})`);
  }

  path.actions.forEach((action) => {
    if (action.type === "distanceCallback") {
      const s = lengthIn <= 1e-9 ? 0 : action.distanceIn / lengthIn;
      lines.push(`  .addDistanceCallback(${s.toFixed(3)}, this::${safeMethodName(action.label)})`);
    } else {
      lines.push(
        `  .addAngularCallback(Angle.fromDeg(${formatNumber(action.angleDeg)}), this::${safeMethodName(action.label)})`,
      );
    }
  });

  lines.push("  .build();");
  return lines.join("\n");
}

function buildTurnPreview(
  turn: EditorTurn,
  variableName: string,
  pathVariables: Map<string, string>,
): string {
  const sourcePath = turn.sourcePathId ? pathVariables.get(turn.sourcePathId) : null;
  const startPose = sourcePath ? `${sourcePath}.getEndPose()` : formatTurnStartPose(turn);

  return [
    `Turn ${variableName} = new TurnBuilder(${startPose})`,
    `  .turnTo(Angle.fromDeg(${formatNumber(turn.targetHeadingDeg)}))`,
    "  .build();",
  ].join("\n");
}

function formatTurnStartPose(turn: EditorTurn): string {
  return `pose.of(${formatNumber(turn.x)}, ${formatNumber(turn.y)}, ${formatNumber(turn.startHeadingDeg)})`;
}

function formatFavoritePose(pose: EditorPose): string {
  if (pose.kind === "arc") {
    return `pose.arcPoseOf(${formatNumber(pose.x)}, ${formatNumber(pose.y)}, ${formatNumber(pose.radius)})`;
  }
  return formatPose(pose, true, new Map());
}

function formatPose(
  pose: EditorPose,
  includeHeading: boolean,
  favoriteVariables: Map<string, string>,
): string {
  const favoriteVariable = favoriteVariables.get(pose.id);
  if (favoriteVariable) return favoriteVariable;

  if (pose.kind === "arc" && !includeHeading) {
    return `pose.arcPoseOf(${formatNumber(pose.x)}, ${formatNumber(pose.y)}, ${formatNumber(pose.radius)})`;
  }

  if (!includeHeading || pose.headingDeg === null) {
    return `pose.of(${formatNumber(pose.x)}, ${formatNumber(pose.y)})`;
  }

  const heading = pose.headingDeg ?? 0;
  return `pose.of(${formatNumber(pose.x)}, ${formatNumber(pose.y)}, ${formatNumber(heading)})`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function toCamelIdentifier(value: string): string {
  const words = value.match(/[a-zA-Z0-9]+/g) ?? [];
  return words
    .map((word, index) => {
      const cleaned = word.toLowerCase();
      return index === 0 ? cleaned : cleaned[0].toUpperCase() + cleaned.slice(1);
    })
    .join("")
    .replace(/^[0-9]+/, "");
}

function uniqueName(base: string, usedNames: Set<string>): string {
  let name = base;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${base}${suffix}`;
    suffix++;
  }
  usedNames.add(name);
  return name;
}

function safeMethodName(label: string): string {
  const stripped = label.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (!stripped) return "pathCallback";

  const [first, ...rest] = stripped.split(/\s+/);
  return [
    first[0].toLowerCase() + first.slice(1),
    ...rest.map((part) => part[0].toUpperCase() + part.slice(1)),
  ].join("");
}
