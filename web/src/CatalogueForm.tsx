import type { NpcDraft } from '@blacksmith/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// The catalogue and starting stock as a form: goods sold from stock, and made-to-order item types with the materials
// they use. Each good or material row carries how many the NPC starts with, so stock and catalogue stay in one place.
// Rows are edited here and handed to the draft whenever the names are usable; the server checks everything else.

type Range = { min: number; max: number };
type GoodRow = { name: string; min_price: number; stock: number };
type MaterialRow = { name: string; cost: number; stock: number };
type ItemRow = { name: string; damage: Range; weight: Range; durability: Range; base_ticks: number };
type Form = {
  gold: number;
  sells: boolean;
  goods: GoodRow[];
  makes: boolean;
  items: ItemRow[];
  materials: MaterialRow[];
  margin_pct: number;
  workload_pct: number;
  other: Record<string, number>; // stock that is neither a listed good nor a material, kept as it is
};

type Value = Pick<NpcDraft, 'catalogue' | 'start'>;

const STATS = ['damage', 'weight', 'durability'] as const;
const pct = (share: number) => Math.round(share * 1000) / 10;
const NEW_GOOD: GoodRow = { name: '', min_price: 1, stock: 1 };
const NEW_MATERIAL: MaterialRow = { name: '', cost: 1, stock: 1 };
const NEW_ITEM: ItemRow = { name: '', damage: { min: 1, max: 10 }, weight: { min: 1, max: 5 }, durability: { min: 10, max: 50 }, base_ticks: 4 };

function toForm({ catalogue, start }: Value): Form {
  const stock = { ...start.stock };
  const take = (name: string) => {
    const n = stock[name] ?? 0;
    delete stock[name];
    return n;
  };
  const mto = catalogue.made_to_order;
  const goods = Object.entries(catalogue.in_stock ?? {}).map(([name, g]) => ({ name, min_price: g.min_price, stock: take(name) }));
  const materials = Object.entries(mto?.materials ?? {}).map(([name, cost]) => ({ name, cost, stock: take(name) }));
  return {
    gold: start.gold,
    sells: Boolean(catalogue.in_stock),
    goods,
    makes: Boolean(mto),
    items: Object.entries(mto?.items ?? {}).map(([name, d]) => ({ name, ...d })),
    materials,
    margin_pct: pct(mto?.min_margin ?? 0.2),
    workload_pct: pct(mto?.workload_per_job ?? 0.5),
    other: stock,
  };
}

// The draft's catalogue and start, or the reason the rows can't be one yet.
function fromForm(f: Form): { value: Value } | { problem: string } {
  // The ledger refuses an empty list, so a ticked box needs rows. (Removing the last good unticks its box instead.)
  if (f.sells && f.goods.length === 0) return { problem: 'Add an item, or turn off "Sells items in stock".' };
  if (f.makes && (f.items.length === 0 || f.materials.length === 0)) {
    return { problem: 'Add an item type and a material, or turn off "Makes items to order".' };
  }
  const lists = [...(f.sells ? [f.goods] : []), ...(f.makes ? [f.items, f.materials] : [])];
  if (lists.some((rows) => rows.some((r) => !r.name.trim()))) return { problem: 'Every row needs a name.' };
  for (const rows of lists) {
    const names = rows.map((r) => r.name.trim());
    if (new Set(names).size !== names.length) return { problem: 'A name is listed twice.' };
  }
  // Goods and materials share one stock, so a name can't be both.
  const stocked = [...(f.sells ? f.goods : []), ...(f.makes ? f.materials : [])].map((r) => r.name.trim());
  if (new Set(stocked).size !== stocked.length) return { problem: 'A good and a material have the same name.' };

  const stock: Record<string, number> = { ...f.other };
  const catalogue: Value['catalogue'] = {};
  if (f.sells) {
    catalogue.in_stock = Object.fromEntries(f.goods.map((g) => [g.name.trim(), { min_price: g.min_price }]));
    for (const g of f.goods) stock[g.name.trim()] = g.stock;
  }
  if (f.makes) {
    catalogue.made_to_order = {
      items: Object.fromEntries(f.items.map(({ name, ...d }) => [name.trim(), d])),
      materials: Object.fromEntries(f.materials.map((m) => [m.name.trim(), m.cost])),
      min_margin: f.margin_pct / 100,
      workload_per_job: f.workload_pct / 100,
    };
    for (const m of f.materials) stock[m.name.trim()] = m.stock;
  }
  return { value: { catalogue, start: { gold: f.gold, stock } } };
}

// Only the catalogue and start: the form is handed the whole draft, and edits elsewhere in it mustn't rebuild the rows.
const key = (v: Value) => JSON.stringify({ catalogue: v.catalogue, start: v.start });

export function CatalogueForm({ value, onChange }: { value: Value; onChange: (v: Value) => void }) {
  const [form, setForm] = useState(() => toForm(value));
  const [problem, setProblem] = useState<string | null>(null);
  const shown = useRef(key(value));

  // A new starting point (or a draft loaded from storage) replaces the rows; the form's own edits don't come back here,
  // so rows that aren't in the draft (unnamed ones, or a list whose box is unticked) survive.
  useEffect(() => {
    if (key(value) === shown.current) return;
    shown.current = key(value);
    setForm(toForm(value));
    setProblem(null);
  }, [value]);

  const update = (next: Form) => {
    setForm(next);
    const r = fromForm(next);
    if ('problem' in r) return setProblem(r.problem);
    setProblem(null);
    shown.current = key(r.value);
    onChange(r.value);
  };
  const patch = (p: Partial<Form>) => update({ ...form, ...p });
  const row = <K extends 'goods' | 'items' | 'materials'>(list: K, i: number, p: Partial<Form[K][number]>) =>
    patch({ [list]: form[list].map((r, j) => (j === i ? { ...r, ...p } : r)) } as Partial<Form>);
  const remove = (list: 'goods' | 'items' | 'materials', i: number) => {
    const rest = form[list].filter((_, j) => j !== i);
    // Goods are all that "Sells from stock" holds, so taking the last one away unticks it.
    patch({ [list]: rest, ...(list === 'goods' && rest.length === 0 && { sells: false }) } as Partial<Form>);
  };

  return (
    <div className="catalogue">
      <label className="check">
        <input type="checkbox" checked={form.sells} onChange={(e) => patch({ sells: e.target.checked, goods: form.goods.length ? form.goods : [{ ...NEW_GOOD }] })} />
        <span>
          <b>Sells items in stock</b> <span className="muted">The customer receives items when they accept an offer.</span>
        </span>
      </label>
      {form.sells && (
        <Rows head={['Item', 'Minimum price each', 'In stock', '']} onAdd={() => patch({ goods: [...form.goods, { ...NEW_GOOD }] })} addLabel="Add an item">
          {form.goods.map((g, i) => (
            <tr key={i}>
              <td>
                <Name value={g.name} field={`catalogue.in_stock.${g.name}`} onChange={(name) => row('goods', i, { name })} label="Item name" />
              </td>
              <td>
                <Cell value={g.min_price} field={`catalogue.in_stock.${g.name}.min_price`} onChange={(min_price) => row('goods', i, { min_price })} label={`${g.name || 'Good'} minimum price`} />
              </td>
              <td>
                <Cell value={g.stock} field={`start.stock.${g.name}`} onChange={(stock) => row('goods', i, { stock })} label={`${g.name || 'Good'} in stock`} />
              </td>
              <td>
                <Remove onClick={() => remove('goods', i)} label={`Remove ${g.name || 'good'}`} />
              </td>
            </tr>
          ))}
        </Rows>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={form.makes}
          onChange={(e) =>
            patch({
              makes: e.target.checked,
              items: form.items.length ? form.items : [{ ...NEW_ITEM }],
              materials: form.materials.length ? form.materials : [{ ...NEW_MATERIAL }],
            })
          }
        />
        <span>
          <b>Makes items to order</b> <span className="muted">Work starts when an offer is accepted; the item is delivered when it is ready.</span>
        </span>
      </label>
      {form.makes && (
        <>
          <Rows head={['Item type', 'Damage', 'Weight', 'Durability', 'Hours', '']} onAdd={() => patch({ items: [...form.items, { ...NEW_ITEM }] })} addLabel="Add an item type">
            {form.items.map((it, i) => (
              <tr key={i}>
                <td>
                  <Name value={it.name} field={`catalogue.made_to_order.items.${it.name}`} onChange={(name) => row('items', i, { name })} label="Item type" />
                </td>
                {STATS.map((s) => (
                  <td key={s} className="range">
                    <span>
                      <Cell value={it[s].min} field={`catalogue.made_to_order.items.${it.name}.${s}.min`} onChange={(min) => row('items', i, { [s]: { ...it[s], min } })} label={`${it.name || 'Item'} ${s} min`} />
                      <span className="muted">–</span>
                      <Cell value={it[s].max} field={`catalogue.made_to_order.items.${it.name}.${s}.max`} onChange={(max) => row('items', i, { [s]: { ...it[s], max } })} label={`${it.name || 'Item'} ${s} max`} />
                    </span>
                  </td>
                ))}
                <td>
                  <Cell value={it.base_ticks} field={`catalogue.made_to_order.items.${it.name}.base_ticks`} onChange={(base_ticks) => row('items', i, { base_ticks })} label={`${it.name || 'Item'} base hours`} />
                </td>
                <td>
                  <Remove onClick={() => remove('items', i)} label={`Remove ${it.name || 'item type'}`} />
                </td>
              </tr>
            ))}
          </Rows>
          <Rows head={['Material', 'Cost each', 'In stock', '']} onAdd={() => patch({ materials: [...form.materials, { ...NEW_MATERIAL }] })} addLabel="Add a material">
            {form.materials.map((m, i) => (
              <tr key={i}>
                <td>
                  <Name value={m.name} field={`catalogue.made_to_order.materials.${m.name}.__name`} onChange={(name) => row('materials', i, { name })} label="Material name" />
                </td>
                <td>
                  <Cell value={m.cost} field={`catalogue.made_to_order.materials.${m.name}`} onChange={(cost) => row('materials', i, { cost })} label={`${m.name || 'Material'} cost`} />
                </td>
                <td>
                  <Cell value={m.stock} field={`start.stock.${m.name}`} onChange={(stock) => row('materials', i, { stock })} label={`${m.name || 'Material'} in stock`} />
                </td>
                <td>
                  <Remove onClick={() => remove('materials', i)} label={`Remove ${m.name || 'material'}`} />
                </td>
              </tr>
            ))}
          </Rows>
          <div className="row2">
            <Num label="Margin on materials, %" field="catalogue.made_to_order.min_margin" value={form.margin_pct} step={5} onChange={(margin_pct) => patch({ margin_pct })} />
            <Num label="Extra time per job in hand, %" field="catalogue.made_to_order.workload_per_job" value={form.workload_pct} step={5} onChange={(workload_pct) => patch({ workload_pct })} />
          </div>
        </>
      )}
      <Num label="Starting gold" field="start.gold" value={form.gold} onChange={(gold) => patch({ gold })} />
      {problem && (
        <div className="note bad" role="alert">
          {problem} The draft keeps the last valid settings until this is fixed.
        </div>
      )}
    </div>
  );
}

function Rows({ head, children, onAdd, addLabel }: { head: string[]; children: ReactNode; onAdd: () => void; addLabel: string }) {
  return (
    <div className="rows">
      <div className="rows-scroll">
        <table className="verbs cat-table">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      <button type="button" className="secondary small" onClick={onAdd}>
        + {addLabel}
      </button>
    </div>
  );
}

const toInt = (s: string) => {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
};

function Name({ value, onChange, label, field }: { value: string; onChange: (v: string) => void; label: string; field?: string }) {
  return <input className="cat-name" data-field={field} value={value} maxLength={41} placeholder="name" aria-label={label} onChange={(e) => onChange(e.target.value)} />;
}

const toNumber = (s: string) => Number(s) || 0;

// A number box that may be left empty while typing: an empty box counts as 0 but isn't shown as one,
// so clearing it to type a new value doesn't leave a 0 in front. A value changed from outside replaces the text.
function NumberInput({ value, onChange, parse, ...rest }: { value: number; onChange: (v: number) => void; parse: (s: string) => number; className?: string; step?: number; 'aria-label'?: string; 'data-field'?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((t) => (parse(t) === value ? t : String(value)));
  }, [value, parse]);
  return (
    <input
      {...rest}
      type="number"
      min={0}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parse(e.target.value));
      }}
    />
  );
}

function Cell({ value, onChange, label, field }: { value: number; onChange: (v: number) => void; label: string; field?: string }) {
  return <NumberInput className="cat-num" data-field={field} value={value} parse={toInt} aria-label={label} onChange={onChange} />;
}

function Num({ label, value, onChange, step = 1, field }: { label: string; value: number; onChange: (v: number) => void; step?: number; field?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <NumberInput data-field={field} value={value} step={step} parse={toNumber} onChange={onChange} />
    </label>
  );
}

function Remove({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="secondary small" onClick={onClick} aria-label={label} title={label}>
      ✕
    </button>
  );
}
