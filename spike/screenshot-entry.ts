export async function capture(
  library: "modern" | "snapdom",
  node: HTMLElement,
): Promise<string> {
  if (library === "modern") {
    const { domToPng } = await import("modern-screenshot");
    return domToPng(node, { scale: 1, timeout: 5000 });
  }
  const { snapdom } = await import("@zumer/snapdom");
  return (await snapdom.toPng(node, { scale: 1, dpr: 1 })).src;
}
