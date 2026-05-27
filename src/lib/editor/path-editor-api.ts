import { InterpolationStyle } from "@/lib/geometry";
import type { BuiltPath, EditorPath, EditorPose } from "@/lib/editor/path-editor-types";

// Converts editor state into the Java-style fluent API preview.
export function formatStyle(style: InterpolationStyle): string {
  return style
    .split("_")
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(" ");
}

export function buildAllApiPreview(paths: EditorPath[], builtPaths: BuiltPath[]): string {
  const usedNames = new Set<string>();
  return paths
    .map((path, index) => {
      const built = builtPaths.find((item) => item.path.id === path.id);
      const variable = uniqueName(toCamelIdentifier(path.name) || `path${index + 1}`, usedNames);
      return buildApiPreview(path, built?.segment?.getLengthIn() ?? 0, variable);
    })
    .join("\n\n");
}

function buildApiPreview(path: EditorPath, lengthIn: number, variableName: string): string {
  const [startPose, ...controlPoses] = path.poses;
  const lines = [`Path ${variableName} = new PathBuilder(${formatStartPose(startPose)})`];

  lines.push("  .addControlPoints(");
  controlPoses.forEach((pose, index) => {
    const suffix = index === controlPoses.length - 1 ? "" : ",";
    const isEndPose = index === controlPoses.length - 1;
    lines.push(`    ${formatControlPose(pose, isEndPose)}${suffix}`);
  });
  lines.push("  )");

  if (
    path.interpolation === InterpolationStyle.TANGENT_OPTIMAL ||
    path.interpolation === InterpolationStyle.TANGENT_FORWARD
  ) {
    lines.push(
      `  .interpolateWith(new HeadingInterpolator(InterpolationStyle.${path.interpolation}))`,
    );
  } else if (path.interpolation === InterpolationStyle.CONSTANT_START_HEADING) {
    lines.push(
      "  .interpolateWith(new HeadingInterpolator(InterpolationStyle.CONSTANT_START_HEADING))",
    );
  } else if (path.interpolation === InterpolationStyle.CONSTANT_END_HEADING) {
    lines.push(
      "  .interpolateWith(new HeadingInterpolator(InterpolationStyle.CONSTANT_END_HEADING))",
    );
  } else if (path.interpolation === InterpolationStyle.TANGENT_CUSTOM) {
    lines.push(
      `  .interpolateWith(new HeadingInterpolator(InterpolationStyle.TANGENT_CUSTOM, Angle.fromDeg(${formatNumber(path.tangentOffsetDeg)})))`,
    );
  } else if (path.interpolation === InterpolationStyle.CUSTOM_DIST_FUNCTION) {
    lines.push(`  .interpolateWith(${path.customFunctionSource})`);
  }

  path.actions.forEach((action) => {
    if (action.type === "callback") {
      const s = lengthIn <= 1e-9 ? 0 : action.distanceIn / lengthIn;
      lines.push(`  .addCallback(${s.toFixed(3)}, this::${safeMethodName(action.label)})`);
    } else if (action.type === "turn") {
      lines.push(`  .turnTo(Angle.fromDeg(${formatNumber(action.headingDeg)}))`);
    } else {
      lines.push(`  .holdPose(${formatNumber(action.durationSeconds)})`);
    }
  });

  lines.push("  .build();");
  return lines.join("\n");
}

function formatStartPose(pose: EditorPose): string {
  const heading = pose.headingDeg ?? 0;
  return `pose.build(${formatNumber(pose.x)}, ${formatNumber(pose.y)}, ${formatNumber(heading)})`;
}

function formatControlPose(pose: EditorPose, includeHeading: boolean): string {
  if (pose.kind === "arc") {
    return `pose.arcPoseAt(${formatNumber(pose.x)}, ${formatNumber(pose.y)}, ${formatNumber(pose.radius)})`;
  }

  if (!includeHeading || pose.headingDeg === null) {
    return `pose.at(${formatNumber(pose.x)}, ${formatNumber(pose.y)})`;
  }

  return `pose.at(${formatNumber(pose.x)}, ${formatNumber(pose.y)}, ${formatNumber(pose.headingDeg)})`;
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
