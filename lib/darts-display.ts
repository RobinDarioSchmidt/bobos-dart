export function formatOutLabel(doubleOut: boolean, mode: string, finishMode?: string | null) {
  if (finishMode === "master" || mode.toLowerCase().includes("master")) {
    return "Masters Out";
  }

  if (finishMode === "single") {
    return "Straight Out";
  }

  return doubleOut ? "Double Out" : "Straight Out";
}
