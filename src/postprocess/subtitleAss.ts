export interface AssSubtitleInput {
  lines: string[];
  durationSeconds: number;
  width: number;
  height: number;
}

export function buildAssSubtitles(input: AssSubtitleInput): string {
  const nonEmptyLines = input.lines.map((line) => line.trim()).filter(Boolean);
  const slotSeconds = input.durationSeconds / Math.max(nonEmptyLines.length, 1);
  const events = nonEmptyLines.map((line, index) => {
    const start = formatAssTime(slotSeconds * index);
    const end = formatAssTime(index === nonEmptyLines.length - 1 ? input.durationSeconds : slotSeconds * (index + 1));
    const style = index === nonEmptyLines.length - 1 ? "CTA" : "Default";
    return `Dialogue: 0,${start},${end},${style},,0,0,0,,${escapeAssText(line)}`;
  });

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${input.width}`,
    `PlayResY: ${input.height}`,
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Arial,64,&H00FFFFFF,&H000000FF,&H9A000000,&H68000000,1,0,0,0,100,100,0,0,1,4,1,2,72,72,210,1",
    "Style: CTA,Arial,72,&H00FFFFFF,&H000000FF,&H9A202020,&H7A000000,1,0,0,0,100,100,0,0,1,5,1,2,72,72,210,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    ""
  ].join("\n");
}

function formatAssTime(totalSeconds: number): string {
  const safeSeconds = Math.max(totalSeconds, 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const centiseconds = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 100);
  return `${hours}:${pad2(minutes)}:${pad2(seconds)}.${pad2(centiseconds)}`;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
}
