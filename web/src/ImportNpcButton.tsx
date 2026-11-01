import { useRef } from 'react';

// The same picker can be used by starting points, the Workshop toolbar and the later connection screen.
export function ImportNpcButton({ disabled, onImport }: { disabled: boolean; onImport: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <button type="button" className="secondary" disabled={disabled} onClick={() => input.current?.click()}>Import NPC</button>
    <input ref={input} type="file" accept=".json,application/json" hidden disabled={disabled} onChange={(e) => {
      const file = e.currentTarget.files?.[0];
      e.currentTarget.value = ''; // Picking the same file after an error or cancellation must work again.
      if (file) onImport(file);
    }} />
  </>;
}
