import type { NpcArt, NpcDraft, SketchResponse } from '@blacksmith/shared';
// The zod-free module, so the schemas stay out of the bundle.
import { MAX_ART_STYLE, MAX_REFERENCE_BYTES, MAX_REFERENCES, MAX_SKETCH_SUBJECT } from '@blacksmith/shared/src/npc-info';
import { useRef, useState, type DragEvent } from 'react';
import { editorApi } from './api';

// How the pictures of what an NPC makes look: a line of art direction and up to three reference pictures, plus a
// trial picture so the creator sees the style before an order comes in. The offer still decides what is drawn.

const MAX_SIDE = 512; // a dropped picture is shrunk to this before it joins the draft

class TooBig extends Error {}

const bytesOf = (dataUrl: string) => ((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4;

// Any picture the browser can open, as a PNG data URL no bigger than a reference may be (a JPEG if the PNG is too big).
// Small pictures keep their size, so pixel art stays crisp.
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  for (const side of [MAX_SIDE, 384, 256]) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const url of [canvas.toDataURL('image/png'), canvas.toDataURL('image/jpeg', 0.85)]) {
      if (bytesOf(url) <= MAX_REFERENCE_BYTES) return url;
    }
  }
  throw new TooBig(`${file.name} is too big even when shrunk.`);
}

// Something this NPC would make, so the first trial picture needs no typing.
export function sampleSubject(d: Pick<NpcDraft, 'catalogue'>): string {
  const item = Object.keys(d.catalogue.made_to_order?.items ?? {})[0];
  const good = Object.keys(d.catalogue.in_stock ?? {})[0];
  const name = (item ?? good)?.replace(/_/g, ' ');
  return name ? `a fantasy ${name}` : 'a small keepsake';
}

export function ArtForm({ draft, valid, onChange }: { draft: NpcDraft; valid: boolean; onChange: (art: NpcArt) => void }) {
  const { art } = draft;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const add = async (files: FileList | null) => {
    setProblem(null);
    const pictures = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files?.length && pictures.length === 0) return setProblem('Only pictures can be references.');
    const room = MAX_REFERENCES - art.references.length;
    if (pictures.length > room) setProblem(`At most ${MAX_REFERENCES} references; ${room === 0 ? 'remove one first' : `kept the first ${room}`}.`);
    const added: string[] = [];
    for (const f of pictures.slice(0, Math.max(0, room))) {
      try {
        added.push(await shrink(f));
      } catch (e) {
        setProblem(e instanceof TooBig ? e.message : `Couldn't open ${f.name}.`);
      }
    }
    if (added.length) onChange({ ...art, references: [...art.references, ...added] });
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void add(e.dataTransfer.files);
  };

  return (
    <>
      <label className="field">
        <span className="field-label">
          Art direction <span className="muted">added to every picture of what it makes</span>
        </span>
        <textarea
          data-field="art.style"
          rows={2}
          value={art.style}
          maxLength={MAX_ART_STYLE}
          placeholder="e.g. soot-blackened iron, warm ember glow, chunky readable shapes"
          onChange={(e) => onChange({ ...art, style: e.target.value })}
        />
        <span className="muted small">
          {art.style.length}/{MAX_ART_STYLE}. The accepted offer still decides what is drawn; this decides how.
        </span>
      </label>

      <div className="field">
        <span className="field-label">
          Reference pictures <span className="muted">up to {MAX_REFERENCES}: they set the palette, outlines and detail, not the subject</span>
        </span>
        <div
          className={`dropzone${over ? ' over' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.current?.click())}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          {art.references.length === 0 ? (
            <span className="muted">Drop pictures here, or click to choose</span>
          ) : (
            art.references.map((url, i) => (
              <span key={i} className="ref">
                <img src={url} alt={`reference ${i + 1}`} />
                <button
                  type="button"
                  className="secondary small"
                  aria-label={`Remove reference ${i + 1}`}
                  data-field={`art.references.${i}`}
                  onClick={(e) => (e.stopPropagation(), onChange({ ...art, references: art.references.filter((_, j) => j !== i) }))}
                >
                  ×
                </button>
              </span>
            ))
          )}
          {art.references.length > 0 && art.references.length < MAX_REFERENCES && <span className="muted small">+ add</span>}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = '';
          }}
        />
        {problem && <span className="note bad small">{problem}</span>}
      </div>

      <Sketch draft={draft} valid={valid} />
    </>
  );
}

function Sketch({ draft, valid }: { draft: NpcDraft; valid: boolean }) {
  const [subject, setSubject] = useState<string | null>(null); // null: follow the catalogue's suggestion
  const [drawing, setDrawing] = useState(false);
  const [result, setResult] = useState<Extract<SketchResponse, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const what = subject ?? sampleSubject(draft);

  const draw = async () => {
    setDrawing(true);
    setError(null);
    try {
      const r = await editorApi.sketch(draft, what.trim());
      if (r.ok) setResult(r);
      else setError(r.errors.join('; '));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDrawing(false);
    }
  };

  return (
    <div className="field">
      <span className="field-label">
        Try a picture <span className="muted">a few per visit, 10–20 s each</span>
      </span>
      <div className="inline">
        <input value={what} maxLength={MAX_SKETCH_SUBJECT} onChange={(e) => setSubject(e.target.value)} aria-label="What to draw" style={{ flex: 1 }} />
        <button type="button" onClick={draw} disabled={!valid || drawing || !what.trim()}>
          {drawing ? 'Drawing…' : 'Draw it'}
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div className="sketch">
          <img src={result.sprite} alt={`Trial picture: ${what}`} />
          <div className="small">
            <div className="muted">
              Drawn in {(result.latency_ms / 1000).toFixed(1)} s{result.references > 0 && `, with ${result.references} reference${result.references > 1 ? 's' : ''}`}, then
              turned into the 32×32 sprite the village shows.
            </div>
            <details>
              <summary>Prompt</summary>
              <pre className="code">{result.prompt}</pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
