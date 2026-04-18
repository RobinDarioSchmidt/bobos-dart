export function formatOutLabel(doubleOut: boolean, mode: string) {
  if (mode.toLowerCase().includes("master")) {
    return "Masters Out";
  }

  return doubleOut ? "Double Out" : "Single Out";
}
