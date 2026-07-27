const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3006";

for (const id of ["phone-mockup", "aurora-mesh", "holographic-blob", "botanical-branch"]) {
  const response = await fetch(`${baseUrl}/api/studio-raster-extra/${id}.png`);
  if (!response.ok) throw new Error(`Expanded PNG ${id} returned ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 4_000) throw new Error(`Expanded PNG ${id} is unexpectedly small`);
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) {
    throw new Error(`Expanded asset ${id} is not a PNG`);
  }
}

console.log("Expanded PNG Studio runtime assets verified.");
