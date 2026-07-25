import { useCallback, useMemo, useState } from "preact/hooks";
import {
  Blend,
  CircleDot,
  Droplets,
  ImageDown,
  Layers3,
  QrCode,
  RotateCcw,
  Sparkles,
  SunMedium,
  Waves,
} from "lucide-preact";
import * as fabric from "fabric";
import QRCode from "qrcode";
import { ensureObjectId } from "../canvas-model";
import { useEditor } from "../context";

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((character) => character + character).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const number = Number.parseInt(value, 16);
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;
  return `rgba(${red},${green},${blue},${Math.min(Math.max(alpha, 0), 1)})`;
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function smoothBlobPath(points: Array<[number, number]>): string {
  if (points.length < 3) return "";
  const mid = (first: [number, number], second: [number, number]): [number, number] => [
    (first[0] + second[0]) / 2,
    (first[1] + second[1]) / 2,
  ];
  const firstMid = mid(points.at(-1)!, points[0]);
  let path = `M ${firstMid[0]} ${firstMid[1]}`;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const midpoint = mid(point, next);
    path += ` Q ${point[0]} ${point[1]} ${midpoint[0]} ${midpoint[1]}`;
  });
  return `${path} Z`;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onInput,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onInput: (value: number) => void;
}) {
  return (
    <label class="block">
      <div class="flex items-center justify-between mb-1 text-[9px] text-zinc-500">
        <span>{label}</span><span>{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(event) => onInput(Number((event.target as HTMLInputElement).value))}
        class="w-full accent-violet-600"
      />
    </label>
  );
}

function ToolCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Sparkles;
  children: preact.ComponentChildren;
}) {
  return (
    <section class="rounded-xl border border-zinc-200 bg-white p-2.5">
      <div class="flex items-center gap-1.5 mb-2">
        <Icon size={13} class="text-violet-600" />
        <strong class="text-[10px] text-zinc-700">{title}</strong>
      </div>
      <div class="flex flex-col gap-2">{children}</div>
    </section>
  );
}

export function ToolsPanel() {
  const {
    canvas,
    selectedObject,
    canvasWidth,
    canvasHeight,
    updateSelectedObject,
    setBackground,
  } = useEditor();

  const [opacity, setOpacity] = useState(selectedObject?.opacity ?? 1);
  const [shadowColor, setShadowColor] = useState("#000000");
  const [shadowOpacity, setShadowOpacity] = useState(0.28);
  const [shadowBlur, setShadowBlur] = useState(18);
  const [shadowX, setShadowX] = useState(8);
  const [shadowY, setShadowY] = useState(10);

  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [blur, setBlur] = useState(0);
  const [grayscale, setGrayscale] = useState(false);
  const [invert, setInvert] = useState(false);
  const [removeColor, setRemoveColor] = useState(false);
  const [transparentColor, setTransparentColor] = useState("#ffffff");
  const [colorDistance, setColorDistance] = useState(0.18);

  const [gradientA, setGradientA] = useState("#6d5dfc");
  const [gradientB, setGradientB] = useState("#f15bb5");
  const [gradientAngle, setGradientAngle] = useState(135);
  const [patternType, setPatternType] = useState("dots");
  const [patternForeground, setPatternForeground] = useState("#6d5dfc");
  const [patternBackground, setPatternBackground] = useState("#ffffff");
  const [patternSize, setPatternSize] = useState(36);
  const [shapeColor, setShapeColor] = useState("#6d5dfc");
  const [qrText, setQrText] = useState("https://ddone.it");
  const [qrDark, setQrDark] = useState("#171717");
  const [qrLight, setQrLight] = useState("#ffffff");
  const [busy, setBusy] = useState(false);

  const selectedImage = useMemo(
    () => selectedObject instanceof fabric.FabricImage ? selectedObject : null,
    [selectedObject],
  );

  const insertSvg = useCallback(async (svg: string, maximumRatio = 0.45) => {
    if (!canvas) return;
    const loaded = await fabric.loadSVGFromString(svg);
    const objects = loaded.objects.filter(Boolean) as fabric.FabricObject[];
    if (objects.length === 0) return;
    const object = fabric.util.groupSVGElements(objects, loaded.options);
    const width = object.width || 256;
    const height = object.height || 256;
    const scale = Math.min(
      (canvasWidth * maximumRatio) / width,
      (canvasHeight * maximumRatio) / height,
      2,
    );
    object.set({
      left: canvasWidth / 2 - (width * scale) / 2,
      top: canvasHeight / 2 - (height * scale) / 2,
      scaleX: scale,
      scaleY: scale,
    });
    ensureObjectId(object);
    canvas.add(object);
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
  }, [canvas, canvasWidth, canvasHeight]);

  const applyOpacity = useCallback((value: number) => {
    setOpacity(value);
    updateSelectedObject({ opacity: value });
  }, [updateSelectedObject]);

  const applyShadow = useCallback(() => {
    if (!selectedObject) return;
    const shadow = new fabric.Shadow({
      color: hexToRgba(shadowColor, shadowOpacity),
      blur: shadowBlur,
      offsetX: shadowX,
      offsetY: shadowY,
    });
    updateSelectedObject({ shadow });
  }, [selectedObject, shadowColor, shadowOpacity, shadowBlur, shadowX, shadowY, updateSelectedObject]);

  const applyImageFilters = useCallback(() => {
    if (!selectedImage) return;
    const filters: any[] = [];
    const filterLibrary = fabric.filters as any;
    if (brightness !== 0) filters.push(new filterLibrary.Brightness({ brightness }));
    if (contrast !== 0) filters.push(new filterLibrary.Contrast({ contrast }));
    if (saturation !== 0) filters.push(new filterLibrary.Saturation({ saturation }));
    if (blur !== 0) filters.push(new filterLibrary.Blur({ blur }));
    if (grayscale) filters.push(new filterLibrary.Grayscale({ mode: "luminosity" }));
    if (invert) filters.push(new filterLibrary.Invert());
    if (removeColor) {
      filters.push(new filterLibrary.RemoveColor({ color: transparentColor, distance: colorDistance }));
    }
    selectedImage.filters = filters;
    selectedImage.applyFilters();
    updateSelectedObject({ filters, dirty: true });
  }, [
    selectedImage,
    brightness,
    contrast,
    saturation,
    blur,
    grayscale,
    invert,
    removeColor,
    transparentColor,
    colorDistance,
    updateSelectedObject,
  ]);

  const resetImageFilters = useCallback(() => {
    if (!selectedImage) return;
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setBlur(0);
    setGrayscale(false);
    setInvert(false);
    setRemoveColor(false);
    selectedImage.filters = [];
    selectedImage.applyFilters();
    updateSelectedObject({ filters: [], dirty: true });
  }, [selectedImage, updateSelectedObject]);

  const applyMask = useCallback((type: "none" | "circle" | "rounded") => {
    if (!selectedImage) return;
    let clipPath: fabric.FabricObject | undefined;
    if (type === "circle") {
      clipPath = new fabric.Circle({
        radius: Math.min(selectedImage.width || 1, selectedImage.height || 1) / 2,
        originX: "center",
        originY: "center",
      });
    } else if (type === "rounded") {
      clipPath = new fabric.Rect({
        width: selectedImage.width || 1,
        height: selectedImage.height || 1,
        rx: Math.min(selectedImage.width || 1, selectedImage.height || 1) * 0.12,
        ry: Math.min(selectedImage.width || 1, selectedImage.height || 1) * 0.12,
        originX: "center",
        originY: "center",
      });
    }
    updateSelectedObject({ clipPath });
  }, [selectedImage, updateSelectedObject]);

  const gradientSvg = useCallback(() => {
    const radians = (gradientAngle * Math.PI) / 180;
    const x = Math.cos(radians);
    const y = Math.sin(radians);
    const x1 = 50 - x * 50;
    const y1 = 50 - y * 50;
    const x2 = 50 + x * 50;
    const y2 = 50 + y * 50;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}"><defs><linearGradient id="gradient" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%"><stop stop-color="${gradientA}"/><stop offset="1" stop-color="${gradientB}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#gradient)"/></svg>`;
  }, [gradientA, gradientB, gradientAngle, canvasWidth, canvasHeight]);

  const patternSvg = useCallback(() => {
    const size = Math.max(8, patternSize);
    let body = "";
    if (patternType === "dots") {
      body = `<circle cx="${size / 2}" cy="${size / 2}" r="${Math.max(2, size * 0.1)}" fill="${patternForeground}"/>`;
    } else if (patternType === "stripes") {
      body = `<path d="M-${size / 2} ${size / 2} L${size / 2} -${size / 2} M0 ${size} L${size} 0 M${size / 2} ${size * 1.5} L${size * 1.5} ${size / 2}" stroke="${patternForeground}" stroke-width="${Math.max(2, size * 0.12)}"/>`;
    } else if (patternType === "grid") {
      body = `<path d="M0 0H${size}V${size}" fill="none" stroke="${patternForeground}" stroke-width="${Math.max(1, size * 0.04)}"/>`;
    } else {
      body = `<rect width="${size / 2}" height="${size / 2}" fill="${patternForeground}"/><rect x="${size / 2}" y="${size / 2}" width="${size / 2}" height="${size / 2}" fill="${patternForeground}"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}"><defs><pattern id="pattern" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><rect width="${size}" height="${size}" fill="${patternBackground}"/>${body}</pattern></defs><rect width="100%" height="100%" fill="url(#pattern)"/></svg>`;
  }, [patternType, patternForeground, patternBackground, patternSize, canvasWidth, canvasHeight]);

  const createBlob = useCallback(() => {
    const points: Array<[number, number]> = [];
    const count = 10;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const radius = 82 + Math.random() * 34;
      points.push([128 + Math.cos(angle) * radius, 128 + Math.sin(angle) * radius]);
    }
    const path = smoothBlobPath(points);
    return insertSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="${path}" fill="${shapeColor}"/></svg>`);
  }, [shapeColor, insertSvg]);

  const createWave = useCallback(() => {
    const amplitude = 38 + Math.random() * 30;
    const path = `M0 128 C48 ${128 - amplitude}, 80 ${128 + amplitude}, 128 128 S208 ${128 - amplitude}, 256 128`;
    return insertSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="${path}" fill="none" stroke="${shapeColor}" stroke-width="14" stroke-linecap="round"/></svg>`, 0.65);
  }, [shapeColor, insertSvg]);

  const createQr = useCallback(async () => {
    if (!qrText.trim()) return;
    setBusy(true);
    try {
      const svg = await QRCode.toString(qrText.trim(), {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: qrDark, light: qrLight },
      });
      await insertSvg(svg, 0.35);
    } finally {
      setBusy(false);
    }
  }, [qrText, qrDark, qrLight, insertSvg]);

  return (
    <div class="flex flex-col gap-2.5">
      <div class="rounded-xl border border-violet-100 bg-violet-50 p-2.5 text-[10px] leading-relaxed text-violet-800">
        Gli strumenti lavorano sugli oggetti selezionati oppure generano nuovi elementi modificabili. Tutte le modifiche entrano nella cronologia e nella collaborazione realtime.
      </div>

      <ToolCard title="Trasparenza" icon={Droplets}>
        {selectedObject ? (
          <Slider label="Opacità" value={opacity} min={0} max={1} step={0.01} onInput={applyOpacity} />
        ) : (
          <p class="m-0 text-[9px] text-zinc-400">Seleziona un oggetto.</p>
        )}
      </ToolCard>

      <ToolCard title="Generatore ombra" icon={Layers3}>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-[9px] text-zinc-500">Colore<input type="color" value={shadowColor} onInput={(event) => setShadowColor((event.target as HTMLInputElement).value)} class="block w-full h-7 mt-1" /></label>
          <Slider label="Intensità" value={shadowOpacity} min={0} max={1} step={0.01} onInput={setShadowOpacity} />
        </div>
        <Slider label="Sfocatura" value={shadowBlur} min={0} max={80} step={1} onInput={setShadowBlur} />
        <div class="grid grid-cols-2 gap-2">
          <Slider label="Offset X" value={shadowX} min={-80} max={80} step={1} onInput={setShadowX} />
          <Slider label="Offset Y" value={shadowY} min={-80} max={80} step={1} onInput={setShadowY} />
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          <button disabled={!selectedObject} onClick={applyShadow} class="h-8 rounded-lg border-0 bg-violet-600 text-white text-[9px] cursor-pointer disabled:opacity-40">Applica</button>
          <button disabled={!selectedObject} onClick={() => updateSelectedObject({ shadow: undefined })} class="h-8 rounded-lg border border-zinc-200 bg-white text-zinc-600 text-[9px] cursor-pointer disabled:opacity-40">Rimuovi</button>
        </div>
      </ToolCard>

      <ToolCard title="Editor immagine" icon={SunMedium}>
        {selectedImage ? (
          <>
            <Slider label="Luminosità" value={brightness} min={-1} max={1} step={0.01} onInput={setBrightness} />
            <Slider label="Contrasto" value={contrast} min={-1} max={1} step={0.01} onInput={setContrast} />
            <Slider label="Saturazione" value={saturation} min={-1} max={1} step={0.01} onInput={setSaturation} />
            <Slider label="Sfocatura" value={blur} min={0} max={1} step={0.01} onInput={setBlur} />
            <div class="grid grid-cols-2 gap-1.5">
              <label class="flex items-center gap-1 text-[9px] text-zinc-500"><input type="checkbox" checked={grayscale} onChange={(event) => setGrayscale((event.target as HTMLInputElement).checked)} /> Bianco e nero</label>
              <label class="flex items-center gap-1 text-[9px] text-zinc-500"><input type="checkbox" checked={invert} onChange={(event) => setInvert((event.target as HTMLInputElement).checked)} /> Inverti</label>
            </div>
            <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
              <label class="flex items-center gap-1 text-[9px] text-zinc-600"><input type="checkbox" checked={removeColor} onChange={(event) => setRemoveColor((event.target as HTMLInputElement).checked)} /> Rendi trasparente un colore</label>
              {removeColor && (
                <div class="mt-2 flex flex-col gap-2">
                  <input type="color" value={transparentColor} onInput={(event) => setTransparentColor((event.target as HTMLInputElement).value)} class="w-full h-7" />
                  <Slider label="Tolleranza" value={colorDistance} min={0.01} max={1} step={0.01} onInput={setColorDistance} />
                </div>
              )}
            </div>
            <div class="grid grid-cols-2 gap-1.5">
              <button onClick={applyImageFilters} class="h-8 rounded-lg border-0 bg-violet-600 text-white text-[9px] cursor-pointer">Applica filtri</button>
              <button onClick={resetImageFilters} class="h-8 rounded-lg border border-zinc-200 bg-white text-zinc-600 text-[9px] cursor-pointer flex items-center justify-center gap-1"><RotateCcw size={11} /> Reset</button>
            </div>
            <div class="grid grid-cols-3 gap-1">
              <button onClick={() => applyMask("circle")} class="h-7 rounded border border-zinc-200 bg-white text-[8px] cursor-pointer">Cerchio</button>
              <button onClick={() => applyMask("rounded")} class="h-7 rounded border border-zinc-200 bg-white text-[8px] cursor-pointer">Arrotondata</button>
              <button onClick={() => applyMask("none")} class="h-7 rounded border border-zinc-200 bg-white text-[8px] cursor-pointer">Nessuna</button>
            </div>
          </>
        ) : (
          <p class="m-0 text-[9px] text-zinc-400">Seleziona una foto o un’immagine raster.</p>
        )}
      </ToolCard>

      <ToolCard title="Generatore gradiente" icon={Blend}>
        <div class="grid grid-cols-2 gap-2">
          <input type="color" value={gradientA} onInput={(event) => setGradientA((event.target as HTMLInputElement).value)} class="w-full h-8" />
          <input type="color" value={gradientB} onInput={(event) => setGradientB((event.target as HTMLInputElement).value)} class="w-full h-8" />
        </div>
        <Slider label="Angolo" value={gradientAngle} min={0} max={360} step={1} onInput={setGradientAngle} />
        <div class="h-12 rounded-lg border border-zinc-200" style={{ background: `linear-gradient(${gradientAngle}deg, ${gradientA}, ${gradientB})` }} />
        <button onClick={() => setBackground("image", svgDataUrl(gradientSvg()))} class="h-8 rounded-lg border-0 bg-violet-600 text-white text-[9px] cursor-pointer">Usa come sfondo</button>
      </ToolCard>

      <ToolCard title="Generatore pattern" icon={CircleDot}>
        <select value={patternType} onChange={(event) => setPatternType((event.target as HTMLSelectElement).value)} class="h-8 rounded-lg border border-zinc-200 px-2 text-[9px]">
          <option value="dots">Pois</option>
          <option value="stripes">Righe diagonali</option>
          <option value="grid">Griglia</option>
          <option value="checker">Scacchiera</option>
        </select>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-[8px] text-zinc-500">Elemento<input type="color" value={patternForeground} onInput={(event) => setPatternForeground((event.target as HTMLInputElement).value)} class="block w-full h-7 mt-1" /></label>
          <label class="text-[8px] text-zinc-500">Sfondo<input type="color" value={patternBackground} onInput={(event) => setPatternBackground((event.target as HTMLInputElement).value)} class="block w-full h-7 mt-1" /></label>
        </div>
        <Slider label="Dimensione" value={patternSize} min={8} max={120} step={1} onInput={setPatternSize} />
        <button onClick={() => setBackground("image", svgDataUrl(patternSvg()))} class="h-8 rounded-lg border-0 bg-violet-600 text-white text-[9px] cursor-pointer">Usa come sfondo</button>
      </ToolCard>

      <ToolCard title="Forme generative" icon={Waves}>
        <input type="color" value={shapeColor} onInput={(event) => setShapeColor((event.target as HTMLInputElement).value)} class="w-full h-8" />
        <div class="grid grid-cols-2 gap-1.5">
          <button onClick={() => void createBlob()} class="h-8 rounded-lg border border-zinc-200 bg-white text-zinc-600 text-[9px] cursor-pointer">Blob casuale</button>
          <button onClick={() => void createWave()} class="h-8 rounded-lg border border-zinc-200 bg-white text-zinc-600 text-[9px] cursor-pointer">Onda</button>
        </div>
      </ToolCard>

      <ToolCard title="Generatore QR" icon={QrCode}>
        <textarea value={qrText} onInput={(event) => setQrText((event.target as HTMLTextAreaElement).value)} rows={3} class="w-full rounded-lg border border-zinc-200 p-2 text-[9px] resize-y" placeholder="URL o testo" />
        <div class="grid grid-cols-2 gap-2">
          <label class="text-[8px] text-zinc-500">Codice<input type="color" value={qrDark} onInput={(event) => setQrDark((event.target as HTMLInputElement).value)} class="block w-full h-7 mt-1" /></label>
          <label class="text-[8px] text-zinc-500">Sfondo<input type="color" value={qrLight} onInput={(event) => setQrLight((event.target as HTMLInputElement).value)} class="block w-full h-7 mt-1" /></label>
        </div>
        <button disabled={busy || !qrText.trim()} onClick={() => void createQr()} class="h-8 rounded-lg border-0 bg-violet-600 text-white text-[9px] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"><ImageDown size={11} /> {busy ? "Generazione…" : "Inserisci QR vettoriale"}</button>
      </ToolCard>
    </div>
  );
}
